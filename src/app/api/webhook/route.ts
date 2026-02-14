import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";
import crypto from "crypto";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Webhook verification (GET request from Meta)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  // Meta sends this when setting up the webhook
  if (mode === "subscribe" && token && challenge) {
    // We need to verify the token against an account
    // For now, accept if token is provided (you'd want to validate against DB)
    // In production, iterate accounts to find matching webhookVerifyToken
    console.log("Webhook verification request received");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// Webhook notifications (POST request from Meta)
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // Parse the payload
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
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

// Types for WhatsApp webhook payload
interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: WebhookValue;
      field: string;
    }>;
  }>;
}

interface WebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: Array<{
    profile: { name: string };
    wa_id: string;
  }>;
  messages?: Array<WebhookMessage>;
  statuses?: Array<WebhookStatus>;
  errors?: Array<{
    code: number;
    title: string;
    message: string;
  }>;
}

interface WebhookMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  voice?: { id: string; mime_type: string; sha256: string };
  document?: {
    id: string;
    mime_type: string;
    sha256: string;
    filename: string;
    caption?: string;
  };
  sticker?: { id: string; mime_type: string; sha256: string };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: Array<{
    name: { formatted_name: string };
    phones?: Array<{ phone: string; type?: string }>;
  }>;
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  reaction?: { message_id: string; emoji: string };
  context?: { message_id: string };
}

interface WebhookStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string }>;
}

async function logWebhook(payload: WebhookPayload, signature: string | null) {
  // This would log to the webhookLogs table
  // For now, just console log
  console.log("Webhook received:", JSON.stringify(payload, null, 2));
}

async function processWebhook(
  payload: WebhookPayload,
  rawBody: string,
  signature: string | null
) {
  if (payload.object !== "whatsapp_business_account") {
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;

      // Find account by phone number ID
      // Note: In a real implementation, you'd have a Convex function to find by phoneNumberId
      // For now, we'll need to verify signature per-account

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

async function processInboundMessage(
  phoneNumberId: string,
  value: WebhookValue,
  message: WebhookMessage
) {
  // Get contact info
  const contactInfo = value.contacts?.[0];
  const waId = message.from;
  const profileName = contactInfo?.profile.name;

  // Map message type
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

  // Build message data
  const messageData: any = {
    waMessageId: message.id,
    type: messageType,
    timestamp: parseInt(message.timestamp) * 1000, // Convert to milliseconds
  };

  // Handle different message types
  switch (message.type) {
    case "text":
      messageData.text = message.text?.body;
      break;

    case "image":
    case "video":
    case "audio":
    case "voice":
    case "document":
    case "sticker":
      // Media messages - need to download the media
      const media = message[message.type as keyof typeof message] as any;
      if (media) {
        messageData.mediaMimeType = media.mime_type;
        if (media.filename) messageData.mediaFilename = media.filename;
        if (media.caption) messageData.caption = media.caption;
        // Note: Media download would happen via Convex action
        // We'd need to trigger downloadMedia action here
      }
      break;

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

  // Handle reply context
  if (message.context) {
    messageData.contextMessageId = message.context.message_id;
  }

  // Log message data for now
  // In production, you'd call Convex mutations here
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

  // Update message status via Convex
  // In production: await convex.mutation(api.messages.updateStatus, {...})
  console.log("Status update:", {
    waMessageId: status.id,
    status: mappedStatus,
    timestamp: parseInt(status.timestamp) * 1000,
    errorCode: status.errors?.[0]?.code?.toString(),
    errorMessage: status.errors?.[0]?.title,
  });
}

// Verify webhook signature
function verifySignature(
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
