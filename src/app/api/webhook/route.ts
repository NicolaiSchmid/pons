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

// Verify webhook signature using HMAC-SHA256
function verifySignature(
	rawBody: string,
	signature: string,
	appSecret: string,
): boolean {
	const expectedSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;

	// Prevent timing attacks
	if (signature.length !== expectedSignature.length) return false;
	return crypto.timingSafeEqual(
		Buffer.from(signature),
		Buffer.from(expectedSignature),
	);
}

// Extract the first phone_number_id from a parsed webhook payload
function extractPhoneNumberId(payload: WebhookPayload): string | null {
	for (const entry of payload.entry) {
		for (const change of entry.changes) {
			if (change.field === "messages") {
				return change.value.metadata.phone_number_id;
			}
		}
	}
	return null;
}

// Webhook notifications (POST request from Meta)
export async function POST(request: NextRequest) {
	const startTime = Date.now();
	const signature = request.headers.get("x-hub-signature-256");

	console.log("[webhook:POST] Incoming webhook", {
		url: request.nextUrl.pathname,
		hasSignature: !!signature,
	});

	const body = await request.text();

	// Parse and validate the payload
	let payload: WebhookPayload;
	try {
		const json: unknown = JSON.parse(body);
		payload = webhookPayloadSchema.parse(json);
		console.log("[webhook:POST] ✓ Payload parsed", {
			object: payload.object,
			entryCount: payload.entry.length,
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("[webhook:POST] ✗ Zod validation error", {
				errors: error.errors,
			});
			return new NextResponse("Invalid payload", { status: 400 });
		}
		console.error("[webhook:POST] ✗ JSON parse error", {
			error: String(error),
		});
		return new NextResponse("Invalid JSON", { status: 400 });
	}

	if (payload.object !== "whatsapp_business_account") {
		return new NextResponse("OK", { status: 200 });
	}

	// Verify signature per-account
	const phoneNumberId = extractPhoneNumberId(payload);
	if (phoneNumberId && signature) {
		const account = await convex.query(api.accounts.getByPhoneNumberId, {
			phoneNumberId,
		});

		if (account?.appSecret) {
			const isValid = verifySignature(body, signature, account.appSecret);
			if (!isValid) {
				console.error("[webhook:POST] ✗ Signature verification failed", {
					phoneNumberId,
				});
				return new NextResponse("Invalid signature", { status: 401 });
			}
			console.log("[webhook:POST] ✓ Signature verified", { phoneNumberId });
		} else if (!account) {
			console.warn("[webhook:POST] ⚠ No account found for phoneNumberId", {
				phoneNumberId,
			});
		}
	} else if (!signature) {
		console.warn(
			"[webhook:POST] ⚠ No signature header — skipping verification",
		);
	}

	// Process each change
	for (const entry of payload.entry) {
		for (const change of entry.changes) {
			if (change.field !== "messages") continue;

			const value = change.value;
			const changePhoneNumberId = value.metadata.phone_number_id;

			console.log("[webhook:POST] Processing", {
				phoneNumberId: changePhoneNumberId,
				messages: value.messages?.length ?? 0,
				statuses: value.statuses?.length ?? 0,
			});

			// Ingest messages
			if (value.messages && value.messages.length > 0) {
				try {
					await convex.mutation(api.webhook.ingestWebhook, {
						phoneNumberId: changePhoneNumberId,
						payload: value,
						signature: signature ?? undefined,
					});
					console.log("[webhook:POST] ✓ Messages ingested", {
						count: value.messages.length,
					});
				} catch (error) {
					console.error("[webhook:POST] ✗ Failed to ingest messages", {
						error: String(error),
					});
				}
			}

			// Ingest status updates
			if (value.statuses) {
				for (const status of value.statuses) {
					try {
						await convex.mutation(api.webhook.ingestStatusUpdate, {
							waMessageId: status.id,
							status: status.status,
							timestamp: parseInt(status.timestamp, 10) * 1000,
							errorCode: status.errors?.[0]?.code?.toString(),
							errorMessage: status.errors?.[0]?.title,
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
