import crypto from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
	throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexHttpClient(convexUrl);

// Zod schemas for WhatsApp webhook payload
const mediaContentSchema = z.object({
	id: z.string(),
	mime_type: z.string(),
	sha256: z.string(),
	filename: z.string().optional(),
	caption: z.string().optional(),
});

const webhookMessageSchema = z.object({
	id: z.string(),
	from: z.string(),
	timestamp: z.string(),
	type: z.string(),
	text: z.object({ body: z.string() }).optional(),
	image: mediaContentSchema.optional(),
	video: mediaContentSchema.optional(),
	audio: mediaContentSchema.optional(),
	voice: mediaContentSchema.optional(),
	document: mediaContentSchema.optional(),
	sticker: mediaContentSchema.optional(),
	location: z
		.object({
			latitude: z.number(),
			longitude: z.number(),
			name: z.string().optional(),
			address: z.string().optional(),
		})
		.optional(),
	contacts: z
		.array(
			z.object({
				name: z.object({ formatted_name: z.string() }),
				phones: z
					.array(z.object({ phone: z.string(), type: z.string().optional() }))
					.optional(),
			}),
		)
		.optional(),
	interactive: z
		.object({
			type: z.string(),
			button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
			list_reply: z
				.object({
					id: z.string(),
					title: z.string(),
					description: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	reaction: z.object({ message_id: z.string(), emoji: z.string() }).optional(),
	context: z.object({ message_id: z.string() }).optional(),
});

const webhookStatusSchema = z.object({
	id: z.string(),
	status: z.enum(["sent", "delivered", "read", "failed"]),
	timestamp: z.string(),
	recipient_id: z.string(),
	errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(),
});

const webhookValueSchema = z.object({
	messaging_product: z.string(),
	metadata: z.object({
		display_phone_number: z.string(),
		phone_number_id: z.string(),
	}),
	contacts: z
		.array(
			z.object({
				profile: z.object({ name: z.string() }),
				wa_id: z.string(),
			}),
		)
		.optional(),
	messages: z.array(webhookMessageSchema).optional(),
	statuses: z.array(webhookStatusSchema).optional(),
	errors: z
		.array(
			z.object({
				code: z.number(),
				title: z.string(),
				message: z.string(),
			}),
		)
		.optional(),
});

const webhookPayloadSchema = z.object({
	object: z.string(),
	entry: z.array(
		z.object({
			id: z.string(),
			changes: z.array(
				z.object({
					value: webhookValueSchema,
					field: z.string(),
				}),
			),
		}),
	),
});

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

// Webhook verification (GET request from Meta)
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const mode = searchParams.get("hub.mode");
	const token = searchParams.get("hub.verify_token");
	const challenge = searchParams.get("hub.challenge");

	console.log("[webhook:GET] Verification request", {
		mode,
		hasToken: !!token,
		tokenPreview: token ? `${token.slice(0, 8)}...` : null,
		hasChallenge: !!challenge,
		url: request.nextUrl.pathname,
	});

	if (mode === "subscribe" && token && challenge) {
		// TODO: Validate token against accounts in DB
		console.log("[webhook:GET] ✓ Verification successful, returning challenge");
		return new NextResponse(challenge, { status: 200 });
	}

	console.log(
		"[webhook:GET] ✗ Verification failed — missing mode/token/challenge",
	);
	return new NextResponse("Forbidden", { status: 403 });
}

// Webhook notifications (POST request from Meta)
export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const headers = Object.fromEntries(request.headers.entries());
	const signature = request.headers.get("x-hub-signature-256");

	console.log("[webhook:POST] Incoming webhook", {
		url: request.nextUrl.pathname,
		method: request.method,
		hasSignature: !!signature,
		signaturePreview: signature ? `${signature.slice(0, 20)}...` : null,
		contentType: headers["content-type"],
		userAgent: headers["user-agent"],
	});

	const body = await request.text();
	console.log("[webhook:POST] Body received", {
		length: body.length,
		preview: body.slice(0, 200),
	});

	// Parse and validate the payload
	let payload: WebhookPayload;
	try {
		const json: unknown = JSON.parse(body);
		payload = webhookPayloadSchema.parse(json);
		console.log("[webhook:POST] ✓ Payload parsed", {
			object: payload.object,
			entryCount: payload.entry.length,
			entries: payload.entry.map((e) => ({
				id: e.id,
				changeCount: e.changes.length,
				fields: e.changes.map((c) => c.field),
			})),
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("[webhook:POST] ✗ Zod validation error", {
				errors: error.errors,
				bodyPreview: body.slice(0, 500),
			});
			return new NextResponse("Invalid payload", { status: 400 });
		}
		console.error("[webhook:POST] ✗ JSON parse error", {
			error: String(error),
			bodyPreview: body.slice(0, 200),
		});
		return new NextResponse("Invalid JSON", { status: 400 });
	}

	if (payload.object !== "whatsapp_business_account") {
		console.log("[webhook:POST] Skipping non-whatsapp payload", {
			object: payload.object,
		});
		return new NextResponse("OK", { status: 200 });
	}

	// Process each change
	for (const entry of payload.entry) {
		for (const change of entry.changes) {
			if (change.field !== "messages") {
				console.log("[webhook:POST] Skipping non-messages field", {
					field: change.field,
					entryId: entry.id,
				});
				continue;
			}

			const value = change.value;
			const phoneNumberId = value.metadata.phone_number_id;

			console.log("[webhook:POST] Processing change", {
				entryId: entry.id,
				phoneNumberId,
				displayPhone: value.metadata.display_phone_number,
				messageCount: value.messages?.length ?? 0,
				statusCount: value.statuses?.length ?? 0,
				contacts: value.contacts?.map((c) => ({
					name: c.profile.name,
					waId: c.wa_id,
				})),
				errorCount: value.errors?.length ?? 0,
			});

			// Ingest messages
			if (value.messages && value.messages.length > 0) {
				for (const msg of value.messages) {
					console.log("[webhook:POST] Message", {
						id: msg.id,
						from: msg.from,
						type: msg.type,
						timestamp: msg.timestamp,
						hasText: !!msg.text,
						textPreview: msg.text?.body?.slice(0, 80),
					});
				}

				try {
					await convex.mutation(api.webhook.ingestWebhook, {
						phoneNumberId,
						payload: value,
						signature: signature ?? undefined,
					});
					console.log("[webhook:POST] ✓ Messages ingested", {
						phoneNumberId,
						count: value.messages.length,
					});
				} catch (error) {
					console.error("[webhook:POST] ✗ Failed to ingest messages", {
						phoneNumberId,
						error: String(error),
						stack:
							error instanceof Error ? error.stack?.slice(0, 300) : undefined,
					});
				}
			}

			// Ingest status updates
			if (value.statuses) {
				for (const status of value.statuses) {
					console.log("[webhook:POST] Status update", {
						waMessageId: status.id,
						status: status.status,
						recipientId: status.recipient_id,
						hasErrors: !!status.errors?.length,
					});

					try {
						await convex.mutation(api.webhook.ingestStatusUpdate, {
							waMessageId: status.id,
							status: status.status,
							timestamp: parseInt(status.timestamp, 10) * 1000,
							errorCode: status.errors?.[0]?.code?.toString(),
							errorMessage: status.errors?.[0]?.title,
						});
						console.log("[webhook:POST] ✓ Status ingested", {
							waMessageId: status.id,
							status: status.status,
						});
					} catch (error) {
						console.error("[webhook:POST] ✗ Failed to ingest status", {
							waMessageId: status.id,
							error: String(error),
						});
					}
				}
			}
		}
	}

	const elapsed = Date.now() - startTime;
	console.log("[webhook:POST] ✓ Done", { elapsed: `${elapsed}ms` });

	return new NextResponse("OK", { status: 200 });
}

// Verify webhook signature - for future use with per-account verification
function _verifySignature(
	rawBody: string,
	signature: string,
	appSecret: string,
): boolean {
	const expectedSignature =
		"sha256=" +
		crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

	return crypto.timingSafeEqual(
		Buffer.from(signature),
		Buffer.from(expectedSignature),
	);
}
