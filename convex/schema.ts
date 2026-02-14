import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // WhatsApp Business Accounts
  accounts: defineTable({
    name: v.string(),
    wabaId: v.string(), // WhatsApp Business Account ID
    phoneNumberId: v.string(), // Meta's phone number ID
    phoneNumber: v.string(), // Display number: +1 555 123 4567
    accessToken: v.string(), // Encrypted
    webhookVerifyToken: v.string(), // For webhook verification
    appSecret: v.string(), // Encrypted, for signature verification
    ownerId: v.id("users"),
  })
    .index("by_phone_number_id", ["phoneNumberId"])
    .index("by_owner", ["ownerId"]),

  // Account members (multi-user support)
  accountMembers: defineTable({
    accountId: v.id("accounts"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_account_user", ["accountId", "userId"]),

  // Contacts (customers)
  contacts: defineTable({
    accountId: v.id("accounts"),
    waId: v.string(), // WhatsApp ID (phone number)
    phone: v.string(), // E.164 format: +491234567890
    name: v.optional(v.string()), // Profile name from WhatsApp
  })
    .index("by_account", ["accountId"])
    .index("by_account_wa_id", ["accountId", "waId"]),

  // Conversations (threads with contacts)
  conversations: defineTable({
    accountId: v.id("accounts"),
    contactId: v.id("contacts"),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    unreadCount: v.number(),
    windowExpiresAt: v.optional(v.number()), // 24-hour customer service window
  })
    .index("by_account", ["accountId"])
    .index("by_account_last_message", ["accountId", "lastMessageAt"])
    .index("by_contact", ["contactId"]),

  // Messages
  messages: defineTable({
    accountId: v.id("accounts"),
    conversationId: v.id("conversations"),
    waMessageId: v.string(), // Meta's message ID (wamid.xxx)
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    type: v.union(
      v.literal("text"),
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("voice"),
      v.literal("document"),
      v.literal("sticker"),
      v.literal("location"),
      v.literal("contacts"),
      v.literal("interactive"),
      v.literal("reaction"),
      v.literal("template"),
      v.literal("unknown")
    ),

    // Text content
    text: v.optional(v.string()),
    caption: v.optional(v.string()),

    // Media (Convex file storage)
    mediaId: v.optional(v.id("_storage")),
    mediaMimeType: v.optional(v.string()),
    mediaFilename: v.optional(v.string()),

    // Location
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    locationName: v.optional(v.string()),
    locationAddress: v.optional(v.string()),

    // Contacts (stored as JSON)
    contactsData: v.optional(v.any()),

    // Interactive (button/list replies)
    interactiveType: v.optional(v.string()),
    buttonId: v.optional(v.string()),
    buttonText: v.optional(v.string()),

    // Reaction
    reactionEmoji: v.optional(v.string()),
    reactionToMessageId: v.optional(v.string()),

    // Reply context
    contextMessageId: v.optional(v.string()),

    // Template (outbound only)
    templateName: v.optional(v.string()),
    templateLanguage: v.optional(v.string()),
    templateComponents: v.optional(v.any()),

    // Status tracking
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
    statusTimestamp: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),

    // Timestamps
    timestamp: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_timestamp", ["conversationId", "timestamp"])
    .index("by_wa_message_id", ["waMessageId"])
    .index("by_account", ["accountId"]),

  // Message templates
  templates: defineTable({
    accountId: v.id("accounts"),
    waTemplateId: v.optional(v.string()),
    name: v.string(),
    language: v.string(),
    category: v.union(
      v.literal("marketing"),
      v.literal("utility"),
      v.literal("authentication")
    ),
    status: v.union(
      v.literal("approved"),
      v.literal("pending"),
      v.literal("rejected"),
      v.literal("paused"),
      v.literal("disabled")
    ),
    components: v.any(),
  })
    .index("by_account", ["accountId"])
    .index("by_account_name_language", ["accountId", "name", "language"]),

  // Webhook logs (for debugging)
  webhookLogs: defineTable({
    accountId: v.optional(v.id("accounts")),
    payload: v.any(),
    headers: v.optional(v.any()),
    signature: v.optional(v.string()),
    processed: v.boolean(),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_account", ["accountId"])
    .index("by_processed", ["processed"]),
});
