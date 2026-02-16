import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── Shared validators (reused across schema + mutations) ──

export const accountStatus = v.union(
	v.literal("adding_number"), // POST /{waba}/phone_numbers in flight
	v.literal("code_requested"), // OTP sent via SMS, waiting for code
	v.literal("verifying_code"), // Submitting OTP to Meta
	v.literal("registering"), // POST /register in flight
	v.literal("pending_name_review"), // Registered, display name under Meta review
	v.literal("active"), // Fully operational
	v.literal("name_declined"), // Meta rejected display name
	v.literal("failed"), // Something broke (see failedAtStep)
);

export const numberProvider = v.union(
	v.literal("existing"), // Already on WABA (picked during discovery)
	v.literal("byon"), // Bring Your Own Number
	v.literal("twilio"), // Purchased via Twilio Connect
);

export const registrationStep = v.union(
	v.literal("adding_number"),
	v.literal("code_requested"),
	v.literal("verifying_code"),
	v.literal("registering"),
);

export default defineSchema({
	...authTables,

	// Facebook OAuth tokens (for Graph API calls like WABA discovery)
	facebookTokens: defineTable({
		userId: v.id("users"),
		accessToken: v.string(), // Facebook user access token
		expiresAt: v.optional(v.number()), // Token expiry timestamp (ms)
	}).index("by_user", ["userId"]),

	// ── WhatsApp Business Accounts (single state machine) ──
	//
	// Every account tracks the full lifecycle from phone number provisioning
	// through Meta's display name review to fully active.
	//
	// State transitions:
	//   existing path:  → active (skip everything)
	//   byon/twilio:    adding_number → code_requested → verifying_code
	//                     → registering → pending_name_review → active
	//   any step can  → failed (retryable from failedAtStep)
	//   name review   → name_declined (terminal unless user re-submits)
	//
	// Field availability by state:
	// ┌─────────────────────┬──────────────┬──────────┬────────────┬─────────────┐
	// │ Status              │ phoneNumberId│ verifCode│ twoStepPin │ failedAtStep│
	// ├─────────────────────┼──────────────┼──────────┼────────────┼─────────────┤
	// │ adding_number       │ —            │ —        │ —          │ —           │
	// │ code_requested      │ set          │ —        │ —          │ —           │
	// │ verifying_code      │ set          │ set      │ —          │ —           │
	// │ registering         │ set          │ cleared  │ set        │ —           │
	// │ pending_name_review │ set          │ cleared  │ set        │ —           │
	// │ active              │ set          │ cleared  │ set        │ —           │
	// │ name_declined       │ set          │ cleared  │ set        │ —           │
	// │ failed              │ maybe        │ maybe    │ maybe      │ set         │
	// └─────────────────────┴──────────────┴──────────┴────────────┴─────────────┘
	accounts: defineTable({
		// ── Identity (always set at creation) ──
		ownerId: v.id("users"),
		name: v.string(), // Account display name
		wabaId: v.string(), // WhatsApp Business Account ID
		phoneNumber: v.string(), // E.164: "+4917612345678"
		displayName: v.string(), // WhatsApp display name (shown to recipients)

		// ── Lifecycle ──
		status: accountStatus,
		numberProvider: numberProvider,

		// ── Number details (set progressively) ──
		phoneNumberId: v.optional(v.string()), // Meta's ID — set after adding_number
		accessToken: v.string(), // System User token (or "" to use FB token)
		countryCode: v.optional(v.string()), // "49", "1" — for request_code API

		// ── Twilio-specific (only when numberProvider = "twilio") ──
		twilioConnectionId: v.optional(v.id("twilioConnections")),
		twilioPhoneNumberSid: v.optional(v.string()), // PN... from Twilio

		// ── Verification (ephemeral, cleared after registration) ──
		verificationCode: v.optional(v.string()), // 6-digit OTP
		twoStepPin: v.optional(v.string()), // 6-digit 2FA pin for WhatsApp

		// ── Failure tracking ──
		failedAtStep: v.optional(registrationStep),
		failedError: v.optional(v.string()),
		failedAt: v.optional(v.number()),

		// ── Name review polling (inline, no separate table) ──
		nameReviewLastCheckedAt: v.optional(v.number()),
		nameReviewCheckCount: v.optional(v.number()),
		nameReviewMaxChecks: v.optional(v.number()), // e.g. 72 (3 days hourly)
		nameReviewScheduledJobId: v.optional(v.string()), // Convex scheduler ID
		nameReviewNotifiedAt: v.optional(v.number()), // When we emailed the user
	})
		.index("by_phone_number_id", ["phoneNumberId"])
		.index("by_owner", ["ownerId"])
		.index("by_status", ["status"]),

	// ── Twilio Connect (user-level, not number-level) ──
	twilioConnections: defineTable({
		userId: v.id("users"),
		subaccountSid: v.string(), // AC... from Twilio Connect redirect
		status: v.union(v.literal("active"), v.literal("deauthorized")),
		connectedAt: v.number(),
		deauthorizedAt: v.optional(v.number()),
	})
		.index("by_user", ["userId"])
		.index("by_subaccount_sid", ["subaccountSid"]),

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
			v.literal("unknown"),
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
			v.literal("failed"),
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
		.index("by_account", ["accountId"])
		.searchIndex("search_text", {
			searchField: "text",
			filterFields: ["accountId"],
		}),

	// Message templates
	templates: defineTable({
		accountId: v.id("accounts"),
		waTemplateId: v.optional(v.string()),
		name: v.string(),
		language: v.string(),
		category: v.union(
			v.literal("marketing"),
			v.literal("utility"),
			v.literal("authentication"),
		),
		status: v.union(
			v.literal("approved"),
			v.literal("pending"),
			v.literal("rejected"),
			v.literal("paused"),
			v.literal("disabled"),
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

	// API keys for MCP authentication
	apiKeys: defineTable({
		accountId: v.id("accounts"),
		name: v.string(), // e.g., "Claude Desktop", "Cursor"
		keyHash: v.string(), // SHA-256 hash of the API key
		keyPrefix: v.string(), // First 8 chars for identification (e.g., "pons_abc1")
		createdBy: v.id("users"),
		lastUsedAt: v.optional(v.number()),
		expiresAt: v.optional(v.number()),
		scopes: v.array(v.string()), // e.g., ["read", "write", "send"]
	})
		.index("by_account", ["accountId"])
		.index("by_key_hash", ["keyHash"]),
});
