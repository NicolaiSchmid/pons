import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { auth } from "./auth";

// ============================================
// API Key Management (requires user auth)
// Keys are scoped to users, not accounts.
// A single key grants access to ALL accounts the user is a member of.
// ============================================

/** Allowed MCP API key scopes. Reject unknown scopes to prevent typos and future confusion. */
const VALID_SCOPES = new Set([
	"messages:read",
	"messages:write",
	"conversations:read",
	"templates:read",
]);

export const createApiKey = action({
	args: {
		name: v.string(),
		scopes: v.array(v.string()),
		expiresInDays: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ apiKey: string; keyPrefix: string }> => {
		// Defense-in-depth: verify auth before generating key material
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Validate scopes against allowlist
		const invalidScopes = args.scopes.filter((s) => !VALID_SCOPES.has(s));
		if (invalidScopes.length > 0) {
			throw new Error(
				`Invalid scope(s): ${invalidScopes.join(", ")}. Valid scopes: ${[...VALID_SCOPES].join(", ")}`,
			);
		}
		if (args.scopes.length === 0) {
			throw new Error(
				`At least one scope is required. Valid scopes: ${[...VALID_SCOPES].join(", ")}`,
			);
		}

		// Generate the key using Node action
		const { apiKey, keyHash, keyPrefix } = await ctx.runAction(
			internal.mcpNode.generateApiKeyAction,
			{},
		);

		// Store the key using mutation
		await ctx.runMutation(internal.mcp.createApiKeyInternal, {
			name: args.name,
			keyHash,
			keyPrefix,
			scopes: args.scopes,
			expiresInDays: args.expiresInDays,
		});

		// Return the full key only once - it cannot be retrieved later
		return { apiKey, keyPrefix };
	},
});

// Internal mutation to create API key (called from action)
export const createApiKeyInternal = internalMutation({
	args: {
		name: v.string(),
		keyHash: v.string(),
		keyPrefix: v.string(),
		scopes: v.array(v.string()),
		expiresInDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		await ctx.db.insert("apiKeys", {
			userId,
			name: args.name,
			keyHash: args.keyHash,
			keyPrefix: args.keyPrefix,
			scopes: args.scopes,
			expiresAt: args.expiresInDays
				? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
				: undefined,
		});
	},
});

export const listApiKeys = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const keys = await ctx.db
			.query("apiKeys")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		// Don't return the hash, just metadata
		return keys.map((k) => ({
			_id: k._id,
			name: k.name,
			keyPrefix: k.keyPrefix,
			scopes: k.scopes,
			lastUsedAt: k.lastUsedAt,
			expiresAt: k.expiresAt,
			_creationTime: k._creationTime,
		}));
	},
});

export const revokeApiKey = mutation({
	args: { keyId: v.id("apiKeys") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const key = await ctx.db.get(args.keyId);
		if (!key) throw new Error("API key not found");

		// Users can only revoke their own keys
		if (key.userId !== userId) {
			throw new Error("Unauthorized");
		}

		await ctx.db.delete(args.keyId);
	},
});

// ============================================
// Internal queries for MCP (API key auth)
// ============================================

// Internal query to validate by hash — returns userId and user's accounts
export const validateApiKeyInternal = internalQuery({
	args: { keyHash: v.string() },
	handler: async (ctx, args) => {
		const key = await ctx.db
			.query("apiKeys")
			.withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
			.first();

		if (!key) return null;

		// Check expiration
		if (key.expiresAt && key.expiresAt < Date.now()) {
			return null;
		}

		// Support old keys that have createdBy but no userId (migration compat)
		const keyUserId = key.userId ?? key.createdBy;
		if (!keyUserId) return null;

		// Get all accounts the user has access to
		const memberships = await ctx.db
			.query("accountMembers")
			.withIndex("by_user", (q) => q.eq("userId", keyUserId))
			.collect();

		const accounts = await Promise.all(
			memberships.map(async (m) => {
				const account = await ctx.db.get(m.accountId);
				if (!account) return null;
				return {
					_id: account._id,
					name: account.name,
					phoneNumber: account.phoneNumber,
					status: account.status,
				};
			}),
		);

		const activeAccounts = accounts.filter(
			(a) =>
				a !== null &&
				(a.status === "active" || a.status === "pending_name_review"),
		);

		return {
			keyId: key._id,
			userId: keyUserId,
			scopes: key.scopes,
			accounts: activeAccounts,
		};
	},
});

// Update last used timestamp for API key (internal only)
export const updateApiKeyLastUsed = internalMutation({
	args: { keyId: v.id("apiKeys") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.keyId, { lastUsedAt: Date.now() });
	},
});

// ============================================
// Internal: resolve accountId by phoneNumberId (legacy — kept for webhook gateway)
// ============================================

/**
 * Resolve accountId from a Meta phoneNumberId.
 * Validates the account exists, is active, and belongs to the given user.
 */
export const resolveAccountByPhoneNumberId = internalQuery({
	args: {
		userId: v.string(),
		phoneNumberId: v.string(),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db
			.query("accounts")
			.withIndex("by_phone_number_id", (q) =>
				q.eq("phoneNumberId", args.phoneNumberId),
			)
			.first();

		if (!account) {
			return {
				error: `No account found for phoneNumberId "${args.phoneNumberId}". Check your phoneNumberId in the Meta Business Suite.`,
			};
		}

		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			return {
				error: `Account "${account.name}" (${account.phoneNumber}) is not active (status: ${account.status}).`,
			};
		}

		// Verify the user has access to this account
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
			.filter((q) => q.eq(q.field("accountId"), account._id))
			.first();

		if (!membership) {
			return {
				error: `You do not have access to account "${account.name}" (${account.phoneNumber}).`,
			};
		}

		return { accountId: account._id };
	},
});

// ============================================
// Internal: resolve account by phone number (new — for self-documenting tools)
// ============================================

/**
 * Resolve accountId from a real phone number (E.164 format like "+493023324724").
 * On failure, returns a helpful error listing all available accounts.
 */
export const resolveAccountByPhone = internalQuery({
	args: {
		userId: v.string(),
		phone: v.string(),
	},
	handler: async (ctx, args) => {
		// Normalize: strip spaces, dashes, parens
		const normalized = args.phone.replace(/[\s\-()]/g, "");

		// Try exact match on index first
		let account = await ctx.db
			.query("accounts")
			.withIndex("by_phone_number", (q) => q.eq("phoneNumber", normalized))
			.first();

		// Fallback: if the stored phone has spaces/dashes (e.g. "+49 30 123"),
		// the index lookup with the normalized form won't match.
		// Scan the user's accounts and compare normalized phone numbers.
		if (!account) {
			const memberships = await ctx.db
				.query("accountMembers")
				.withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
				.collect();
			for (const m of memberships) {
				const a = await ctx.db.get(m.accountId);
				if (
					a &&
					(a.status === "active" || a.status === "pending_name_review") &&
					a.phoneNumber.replace(/[\s\-()]/g, "") === normalized
				) {
					account = a;
					break;
				}
			}
		}

		// Helper: list all accounts for this user (for helpful error messages)
		const listUserAccounts = async () => {
			const memberships = await ctx.db
				.query("accountMembers")
				.withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
				.collect();
			const accounts = await Promise.all(
				memberships.map(async (m) => {
					const a = await ctx.db.get(m.accountId);
					if (
						!a ||
						(a.status !== "active" && a.status !== "pending_name_review")
					)
						return null;
					return { phone: a.phoneNumber, name: a.displayName || a.name };
				}),
			);
			return accounts.filter((a) => a !== null);
		};

		if (!account) {
			const available = await listUserAccounts();
			const list =
				available.length > 0
					? available.map((a) => `  • ${a.phone} (${a.name})`).join("\n")
					: "  (no active accounts found)";
			return {
				error: `No account found for "${args.phone}". Available accounts:\n${list}`,
			};
		}

		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			return {
				error: `Account "${account.displayName}" (${account.phoneNumber}) is not active (status: ${account.status}).`,
			};
		}

		// Verify the user has access
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
			.filter((q) => q.eq(q.field("accountId"), account._id))
			.first();

		if (!membership) {
			const available = await listUserAccounts();
			const list =
				available.length > 0
					? available.map((a) => `  • ${a.phone} (${a.name})`).join("\n")
					: "  (no accounts you have access to)";
			return {
				error: `You do not have access to "${account.displayName}" (${account.phoneNumber}). Your accounts:\n${list}`,
			};
		}

		return { accountId: account._id };
	},
});

/**
 * List all active accounts for a user. Used when `from` is omitted.
 */
export const listAccountsForUser = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const memberships = await ctx.db
			.query("accountMembers")
			.withIndex("by_user", (q) => q.eq("userId", args.userId as Id<"users">))
			.collect();

		const accounts = await Promise.all(
			memberships.map(async (m) => {
				const a = await ctx.db.get(m.accountId);
				if (!a || (a.status !== "active" && a.status !== "pending_name_review"))
					return null;
				return { phone: a.phoneNumber, name: a.displayName || a.name };
			}),
		);
		return accounts.filter((a) => a !== null);
	},
});

/**
 * List recent contacts for an account. Used when `phone` (recipient) is omitted.
 */
export const listContactsForAccount = internalQuery({
	args: { accountId: v.id("accounts"), limit: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;
		// Get conversations ordered by most recent activity
		const conversations = await ctx.db
			.query("conversations")
			.withIndex("by_account_last_message", (q) =>
				q.eq("accountId", args.accountId),
			)
			.order("desc")
			.take(limit);

		return Promise.all(
			conversations.map(async (conv) => {
				const contact = await ctx.db.get(conv.contactId);
				return {
					phone: contact?.phone ?? "",
					name: contact?.name ?? "Unknown",
					lastMessageAt: conv.lastMessageAt,
				};
			}),
		);
	},
});

/**
 * Resolve a conversation by the recipient's phone number.
 * Returns the conversationId or null.
 */
export const resolveConversationByPhone = internalQuery({
	args: {
		accountId: v.id("accounts"),
		phone: v.string(),
	},
	handler: async (ctx, args) => {
		const waId = args.phone.replace(/^\+/, "").replace(/[\s\-()]/g, "");
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_account_wa_id", (q) =>
				q.eq("accountId", args.accountId).eq("waId", waId),
			)
			.first();
		if (!contact) return null;

		const conversation = await ctx.db
			.query("conversations")
			.withIndex("by_contact", (q) => q.eq("contactId", contact._id))
			.first();
		if (!conversation) return null;

		return {
			conversationId: conversation._id,
			contactId: contact._id,
			contactName: contact.name ?? "Unknown",
			contactPhone: contact.phone,
		};
	},
});

/**
 * Get recent messages for a conversation (by recipient phone).
 * Used when `waMessageId` is omitted in send_reaction.
 */
export const getRecentMessagesByPhone = internalQuery({
	args: {
		accountId: v.id("accounts"),
		phone: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const waId = args.phone.replace(/^\+/, "").replace(/[\s\-()]/g, "");
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_account_wa_id", (q) =>
				q.eq("accountId", args.accountId).eq("waId", waId),
			)
			.first();
		if (!contact) return [];

		const conversation = await ctx.db
			.query("conversations")
			.withIndex("by_contact", (q) => q.eq("contactId", contact._id))
			.first();
		if (!conversation) return [];

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_conversation_timestamp", (q) =>
				q.eq("conversationId", conversation._id),
			)
			.order("desc")
			.take(args.limit ?? 10);

		return messages.reverse().map((m) => ({
			waMessageId: m.waMessageId,
			direction: m.direction,
			type: m.type,
			text: m.text ?? m.caption ?? `[${m.type}]`,
			timestamp: m.timestamp,
		}));
	},
});

/**
 * Resolve message details from a waMessageId. Used by send_reaction
 * to derive phone and conversationId from just a message ID.
 */
export const resolveMessageByWaId = internalQuery({
	args: {
		accountId: v.id("accounts"),
		waMessageId: v.string(),
	},
	handler: async (ctx, args) => {
		const message = await ctx.db
			.query("messages")
			.withIndex("by_wa_message_id", (q) =>
				q.eq("waMessageId", args.waMessageId),
			)
			.first();
		if (!message || message.accountId !== args.accountId) return null;

		const conversation = await ctx.db.get(message.conversationId);
		if (!conversation) return null;

		const contact = await ctx.db.get(conversation.contactId);
		if (!contact) return null;

		return {
			conversationId: conversation._id,
			contactPhone: contact.phone,
		};
	},
});

// Update conversation metadata (archive state today, labels later)
export const updateConversationInternal = internalMutation({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		archived: v.boolean(),
	},
	handler: async (ctx, args) => {
		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.accountId !== args.accountId) {
			throw new Error("Conversation not found");
		}

		const archivedAt = args.archived ? Date.now() : undefined;
		await ctx.db.patch(args.conversationId, { archivedAt });

		return {
			conversationId: conversation._id,
			archived: args.archived,
			archivedAt,
		};
	},
});

// ============================================
// MCP Tool Queries (internal only — called via gateway actions)
// ============================================

// List conversations for an account
export const listConversationsInternal = internalQuery({
	args: {
		accountId: v.id("accounts"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;

		const conversations = await ctx.db
			.query("conversations")
			.withIndex("by_account_last_message", (q) =>
				q.eq("accountId", args.accountId),
			)
			.order("desc")
			.take(limit);

		// Enrich with contact info
		return Promise.all(
			conversations.map(async (conv) => {
				const contact = await ctx.db.get(conv.contactId);
				return {
					id: conv._id,
					contactName: contact?.name ?? "Unknown",
					contactPhone: contact?.phone ?? "",
					lastMessageAt: conv.lastMessageAt,
					lastMessagePreview: conv.lastMessagePreview,
					unreadCount: conv.unreadCount,
					archived: Boolean(conv.archivedAt),
					windowOpen: conv.windowExpiresAt
						? conv.windowExpiresAt > Date.now()
						: false,
				};
			}),
		);
	},
});

// Get conversation with messages
export const getConversationInternal = internalQuery({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		messageLimit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation || conversation.accountId !== args.accountId) {
			return null;
		}

		const contact = await ctx.db.get(conversation.contactId);

		const messages = await ctx.db
			.query("messages")
			.withIndex("by_conversation_timestamp", (q) =>
				q.eq("conversationId", args.conversationId),
			)
			.order("desc")
			.take(args.messageLimit ?? 50);

		return {
			id: conversation._id,
			contact: {
				id: contact?._id,
				name: contact?.name ?? "Unknown",
				phone: contact?.phone ?? "",
			},
			windowOpen: conversation.windowExpiresAt
				? conversation.windowExpiresAt > Date.now()
				: false,
			windowExpiresAt: conversation.windowExpiresAt,
			messages: messages.reverse().map((m) => ({
				id: m._id,
				waMessageId: m.waMessageId,
				direction: m.direction,
				type: m.type,
				text: m.text ?? m.caption,
				timestamp: m.timestamp,
				status: m.status,
			})),
		};
	},
});

// Search messages across conversations using Convex full-text search index.
// Falls back to in-memory scan for caption-only matches (captions are not
// indexed since Convex search indexes support a single searchField).
export const searchMessagesInternal = internalQuery({
	args: {
		accountId: v.id("accounts"),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;

		// Use full-text search index (filters by accountId within the index)
		const matches = await ctx.db
			.query("messages")
			.withSearchIndex("search_text", (q) =>
				q.search("text", args.query).eq("accountId", args.accountId),
			)
			.take(limit);

		// Enrich with conversation/contact info
		return Promise.all(
			matches.map(async (m) => {
				const conversation = await ctx.db.get(m.conversationId);
				const contact = conversation
					? await ctx.db.get(conversation.contactId)
					: null;

				return {
					id: m._id,
					conversationId: m.conversationId,
					contactName: contact?.name ?? "Unknown",
					contactPhone: contact?.phone ?? "",
					direction: m.direction,
					type: m.type,
					text: m.text ?? m.caption,
					timestamp: m.timestamp,
				};
			}),
		);
	},
});

// List unanswered conversations (last message is inbound)
export const listUnansweredInternal = internalQuery({
	args: {
		accountId: v.id("accounts"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 50;

		const conversations = await ctx.db
			.query("conversations")
			.withIndex("by_account_last_message", (q) =>
				q.eq("accountId", args.accountId),
			)
			.order("desc")
			.take(200); // Scan more to filter

		// For each conversation, check if the most recent message is inbound
		const unanswered = [];
		for (const conv of conversations) {
			if (unanswered.length >= limit) break;

			const lastMessage = await ctx.db
				.query("messages")
				.withIndex("by_conversation_timestamp", (q) =>
					q.eq("conversationId", conv._id),
				)
				.order("desc")
				.first();

			if (lastMessage && lastMessage.direction === "inbound") {
				const contact = await ctx.db.get(conv.contactId);
				unanswered.push({
					id: conv._id,
					contactName: contact?.name ?? "Unknown",
					contactPhone: contact?.phone ?? "",
					lastMessageAt: conv.lastMessageAt,
					lastMessagePreview: conv.lastMessagePreview,
					unreadCount: conv.unreadCount,
					windowOpen: conv.windowExpiresAt
						? conv.windowExpiresAt > Date.now()
						: false,
					lastInboundMessage: {
						id: lastMessage._id,
						waMessageId: lastMessage.waMessageId,
						text: lastMessage.text ?? lastMessage.caption,
						type: lastMessage.type,
						timestamp: lastMessage.timestamp,
					},
				});
			}
		}

		return unanswered;
	},
});

// Get contact by phone (for sending messages)
export const getContactByPhone = internalQuery({
	args: {
		accountId: v.id("accounts"),
		phone: v.string(),
	},
	handler: async (ctx, args) => {
		// Normalize phone to waId format (remove +)
		const waId = args.phone.replace(/^\+/, "");

		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_account_wa_id", (q) =>
				q.eq("accountId", args.accountId).eq("waId", waId),
			)
			.first();

		if (!contact) return null;

		const conversation = await ctx.db
			.query("conversations")
			.withIndex("by_contact", (q) => q.eq("contactId", contact._id))
			.first();

		return {
			contactId: contact._id,
			conversationId: conversation?._id,
			name: contact.name,
			phone: contact.phone,
		};
	},
});

// Get account details (internal only)
export const getAccountInternal = internalQuery({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) return null;

		return {
			phoneNumberId: account.phoneNumberId ?? null,
			status: account.status,
		};
	},
});

// Create or get contact (for sending to new numbers)
export const getOrCreateContact = internalMutation({
	args: {
		accountId: v.id("accounts"),
		phone: v.string(),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const waId = args.phone.replace(/^\+/, "");

		const existing = await ctx.db
			.query("contacts")
			.withIndex("by_account_wa_id", (q) =>
				q.eq("accountId", args.accountId).eq("waId", waId),
			)
			.first();

		if (existing) {
			// Get or create conversation
			const conversation = await ctx.db
				.query("conversations")
				.withIndex("by_contact", (q) => q.eq("contactId", existing._id))
				.first();

			let conversationId = conversation?._id;
			if (!conversationId) {
				conversationId = await ctx.db.insert("conversations", {
					accountId: args.accountId,
					contactId: existing._id,
					unreadCount: 0,
				});
			}

			return {
				contactId: existing._id,
				conversationId,
			};
		}

		// Create new contact
		const contactId = await ctx.db.insert("contacts", {
			accountId: args.accountId,
			waId,
			phone: args.phone.startsWith("+") ? args.phone : `+${args.phone}`,
			name: args.name,
		});

		// Create conversation
		const conversationId = await ctx.db.insert("conversations", {
			accountId: args.accountId,
			contactId,
			unreadCount: 0,
		});

		return { contactId, conversationId };
	},
});
