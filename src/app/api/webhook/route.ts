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

	// Meta sends this when setting up the webhook
	if (mode === "subscribe" && token && challenge) {
		// TODO: Validate token against accounts in DB
		console.log("Webhook verification request received");
		return new NextResponse(challenge, { status: 200 });
	}

	return new NextResponse("Forbidden", { status: 403 });
}

// Webhook notifications (POST request from Meta)
export async function POST(request: NextRequest) {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");

	// Parse and validate the payload
	let payload: WebhookPayload;
	try {
		const json: unknown = JSON.parse(body);
		payload = webhookPayloadSchema.parse(json);
	} catch (error) {
		if (error instanceof z.ZodError) {
			console.error("Webhook validation error:", error.errors);
			return new NextResponse("Invalid payload", { status: 400 });
		}
		return new NextResponse("Invalid JSON", { status: 400 });
	}

	if (payload.object !== "whatsapp_business_account") {
		return new NextResponse("OK", { status: 200 });
	}

	// Process each change - use mutations which are durable and retried
	for (const entry of payload.entry) {
		for (const change of entry.changes) {
			if (change.field !== "messages") continue;

			const value = change.value;
			const phoneNumberId = value.metadata.phone_number_id;

			// Ingest messages - stored durably and processed async
			if (value.messages && value.messages.length > 0) {
				try {
					await convex.mutation(api.webhook.ingestWebhook, {
						phoneNumberId,
						payload: value,
						signature: signature ?? undefined,
					});
				} catch (error) {
					console.error("Failed to ingest webhook:", error);
					// Don't return error - we want Meta to stop retrying
					// The webhook will be lost, but that's better than infinite retries
				}
			}

			// Ingest status updates - also durable mutations
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
						console.error("Failed to ingest status update:", error);
					}
				}
			}
		}
	}

	// Always return 200 to acknowledge receipt
	return new NextResponse("OK", { status: 200 });
}

// Verify webhook signature - for future use with per-account verification
function verifySignature(
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
