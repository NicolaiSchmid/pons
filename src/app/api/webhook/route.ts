import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";

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
      })
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
  reaction: z
    .object({ message_id: z.string(), emoji: z.string() })
    .optional(),
  context: z.object({ message_id: z.string() }).optional(),
});

const webhookStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
  errors: z
    .array(z.object({ code: z.number(), title: z.string() }))
    .optional(),
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
      })
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
      })
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
        })
      ),
    })
  ),
});

type WebhookPayload = z.infer<typeof webhookPayloadSchema>;
type WebhookValue = z.infer<typeof webhookValueSchema>;
type WebhookMessage = z.infer<typeof webhookMessageSchema>;
type WebhookStatus = z.infer<typeof webhookStatusSchema>;
type MediaContent = z.infer<typeof mediaContentSchema>;

interface MessageData {
  waMessageId: string;
  type: string;
  timestamp: number;
  text?: string;
  caption?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaMetaId?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  locationAddress?: string;
  contactsData?: WebhookMessage["contacts"];
  interactiveType?: string;
  buttonId?: string;
  buttonText?: string;
  reactionEmoji?: string;
  reactionToMessageId?: string;
  contextMessageId?: string;
}

// Webhook verification (GET request from Meta)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Meta sends this when setting up the webhook
  if (mode === "subscribe" && token && challenge) {
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

  // Log the webhook (async, don't wait)
  logWebhook(payload, signature);

  // Process the webhook
  try {
    await processWebhook(payload, body, signature);
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 to prevent Meta from retrying
  }

  // Always return 200 to acknowledge receipt
  return new NextResponse("OK", { status: 200 });
}

function logWebhook(payload: WebhookPayload, signature: string | null) {
  console.log(
    "Webhook received:",
    JSON.stringify(payload, null, 2),
    "signature:",
    signature
  );
}

async function processWebhook(
  payload: WebhookPayload,
  _rawBody: string,
  _signature: string | null
) {
  if (payload.object !== "whatsapp_business_account") {
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;

      // Process messages
      if (value.messages) {
        for (const message of value.messages) {
          await processInboundMessage(phoneNumberId, value, message);
        }
      }

      // Process status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await processStatusUpdate(status);
        }
      }
    }
  }
}

function getMediaContent(message: WebhookMessage): MediaContent | undefined {
  switch (message.type) {
    case "image":
      return message.image;
    case "video":
      return message.video;
    case "audio":
      return message.audio;
    case "voice":
      return message.voice;
    case "document":
      return message.document;
    case "sticker":
      return message.sticker;
    default:
      return undefined;
  }
}

async function processInboundMessage(
  phoneNumberId: string,
  value: WebhookValue,
  message: WebhookMessage
) {
  const contactInfo = value.contacts?.[0];
  const waId = message.from;
  const profileName = contactInfo?.profile.name;

  const typeMap: Record<string, string> = {
    text: "text",
    image: "image",
    video: "video",
    audio: "audio",
    voice: "voice",
    document: "document",
    sticker: "sticker",
    location: "location",
    contacts: "contacts",
    interactive: "interactive",
    reaction: "reaction",
  };
  const messageType = typeMap[message.type] ?? "unknown";

  const messageData: MessageData = {
    waMessageId: message.id,
    type: messageType,
    timestamp: parseInt(message.timestamp) * 1000,
  };

  switch (message.type) {
    case "text":
      messageData.text = message.text?.body;
      break;

    case "image":
    case "video":
    case "audio":
    case "voice":
    case "document":
    case "sticker": {
      const media = getMediaContent(message);
      if (media) {
        messageData.mediaMimeType = media.mime_type;
        messageData.mediaMetaId = media.id;
        if (media.filename) messageData.mediaFilename = media.filename;
        if (media.caption) messageData.caption = media.caption;
      }
      break;
    }

    case "location":
      if (message.location) {
        messageData.latitude = message.location.latitude;
        messageData.longitude = message.location.longitude;
        messageData.locationName = message.location.name;
        messageData.locationAddress = message.location.address;
      }
      break;

    case "contacts":
      messageData.contactsData = message.contacts;
      break;

    case "interactive":
      if (message.interactive) {
        messageData.interactiveType = message.interactive.type;
        const reply =
          message.interactive.button_reply ?? message.interactive.list_reply;
        if (reply) {
          messageData.buttonId = reply.id;
          messageData.buttonText = reply.title;
        }
      }
      break;

    case "reaction":
      if (message.reaction) {
        messageData.reactionEmoji = message.reaction.emoji;
        messageData.reactionToMessageId = message.reaction.message_id;
      }
      break;
  }

  if (message.context) {
    messageData.contextMessageId = message.context.message_id;
  }

  // Log message data for now
  // TODO: Call Convex mutations here
  console.log("Processed inbound message:", {
    phoneNumberId,
    waId,
    profileName,
    ...messageData,
  });
}

async function processStatusUpdate(status: WebhookStatus) {
  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  };

  const mappedStatus = statusMap[status.status] ?? "sent";

  // TODO: Call Convex mutation here
  console.log("Status update:", {
    waMessageId: status.id,
    status: mappedStatus,
    timestamp: parseInt(status.timestamp) * 1000,
    errorCode: status.errors?.[0]?.code?.toString(),
    errorMessage: status.errors?.[0]?.title,
  });
}

// Verify webhook signature
export function verifySignature(
  rawBody: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
