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
// ============================================

export const createApiKey = action({
	args: {
		accountId: v.id("accounts"),
		name: v.string(),
		scopes: v.array(v.string()),
		expiresInDays: v.optional(v.number()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ apiKey: string; keyPrefix: string }> => {
		// Generate the key using Node action
		const { apiKey, keyHash, keyPrefix } = await ctx.runAction(
			internal.mcpNode.generateApiKeyAction,
			{},
		);

		// Store the key using mutation
		await ctx.runMutation(internal.mcp.createApiKeyInternal, {
			accountId: args.accountId,
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
		accountId: v.id("accounts"),
		name: v.string(),
		keyHash: v.string(),
		keyPrefix: v.string(),
		scopes: v.array(v.string()),
		expiresInDays: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Check user has access to account
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can create API keys");
		}

		await ctx.db.insert("apiKeys", {
			accountId: args.accountId,
			name: args.name,
			keyHash: args.keyHash,
			keyPrefix: args.keyPrefix,
			createdBy: userId,
			scopes: args.scopes,
			expiresAt: args.expiresInDays
				? Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000
				: undefined,
		});
	},
});

export const listApiKeys = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership) return [];

		const keys = await ctx.db
			.query("apiKeys")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
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

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", key.accountId).eq("userId", userId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can revoke API keys");
		}

		await ctx.db.delete(args.keyId);
	},
});

// ============================================
// Internal queries for MCP (API key auth)
// ============================================

// Type for API key validation result
type ApiKeyValidationResult = {
	keyId: Id<"apiKeys">;
	accountId: Id<"accounts">;
	scopes: string[];
	account: {
		_id: Id<"accounts">;
		name: string;
		phoneNumber: string;
	};
} | null;

// Validate API key and return account info (action because it needs to hash)
export const validateApiKey = action({
	args: { apiKey: v.string() },
	handler: async (ctx, args): Promise<ApiKeyValidationResult> => {
		// Hash the key using Node action
		const keyHash = await ctx.runAction(internal.mcpNode.hashApiKeyAction, {
			apiKey: args.apiKey,
		});

		// Look up the key using internal query
		return ctx.runQuery(internal.mcp.validateApiKeyInternal, { keyHash });
	},
});

// Internal query to validate by hash
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

		const account = await ctx.db.get(key.accountId);
		if (!account) return null;

		return {
			keyId: key._id,
			accountId: key.accountId,
			scopes: key.scopes,
			account: {
				_id: account._id,
				name: account.name,
				phoneNumber: account.phoneNumber,
			},
		};
	},
});

// Update last used timestamp for API key
export const updateApiKeyLastUsed = mutation({
	args: { keyId: v.id("apiKeys") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.keyId, { lastUsedAt: Date.now() });
	},
});

// ============================================
// MCP Tool Queries (public, auth via API key at route level)
// ============================================

// List conversations for an account
export const listConversationsInternal = query({
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
					windowOpen: conv.windowExpiresAt
						? conv.windowExpiresAt > Date.now()
						: false,
				};
			}),
		);
	},
});

// Get conversation with messages
export const getConversationInternal = query({
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

// Search messages across conversations
export const searchMessagesInternal = query({
	args: {
		accountId: v.id("accounts"),
		query: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const limit = args.limit ?? 20;
		const queryLower = args.query.toLowerCase();

		// Get all messages for this account (we'll filter in memory)
		// TODO: Add full-text search index for better performance
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.order("desc")
			.take(500); // Scan last 500 messages

		const matches = messages
			.filter((m) => {
				const text = (m.text ?? m.caption ?? "").toLowerCase();
				return text.includes(queryLower);
			})
			.slice(0, limit);

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
export const listUnansweredInternal = query({
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
export const getContactByPhone = query({
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

// List templates for an account
export const listTemplatesInternal = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const templates = await ctx.db
			.query("templates")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();

		return templates.map((t) => ({
			id: t._id,
			name: t.name,
			language: t.language,
			category: t.category,
			status: t.status,
		}));
	},
});

// Get account details (for MCP)
export const getAccountInternal = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) return null;

		return {
			phoneNumberId: account.phoneNumberId,
			accessToken: account.accessToken,
		};
	},
});

// Create or get contact (for sending to new numbers)
export const getOrCreateContact = mutation({
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
