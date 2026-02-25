import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { auth } from "./auth";
import { checkAccountAccess } from "./helpers";

// List conversations for an account (sorted by last message)
export const list = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
		if (!hasAccess) return [];

		const conversations = await ctx.db
			.query("conversations")
			.withIndex("by_account_last_message", (q) =>
				q.eq("accountId", args.accountId),
			)
			.order("desc")
			.collect();

		// Enrich with contact info
		return Promise.all(
			conversations.map(async (conv) => {
				const contact = await ctx.db.get(conv.contactId);
				return {
					...conv,
					contact,
				};
			}),
		);
	},
});

// Get a single conversation with contact info
export const get = query({
	args: { conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation) return null;

		const hasAccess = await checkAccountAccess(
			ctx,
			userId,
			conversation.accountId,
		);
		if (!hasAccess) return null;

		const contact = await ctx.db.get(conversation.contactId);
		return { ...conversation, contact };
	},
});

// Get or create a conversation for a contact
export const getOrCreate = mutation({
	args: {
		accountId: v.id("accounts"),
		contactId: v.id("contacts"),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
		if (!hasAccess) throw new Error("Unauthorized");

		// Check if conversation exists
		const existing = await ctx.db
			.query("conversations")
			.withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
			.first();

		if (existing) {
			return existing._id;
		}

		// Create new conversation
		return ctx.db.insert("conversations", {
			accountId: args.accountId,
			contactId: args.contactId,
			unreadCount: 0,
		});
	},
});

// Update conversation after a new message (internal only)
export const updateLastMessage = internalMutation({
	args: {
		conversationId: v.id("conversations"),
		preview: v.string(),
		timestamp: v.number(),
		incrementUnread: v.boolean(),
	},
	handler: async (ctx, args) => {
		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation) throw new Error("Conversation not found");

		await ctx.db.patch(args.conversationId, {
			lastMessageAt: args.timestamp,
			lastMessagePreview: args.preview.slice(0, 100),
			unreadCount: args.incrementUnread ? conversation.unreadCount + 1 : 0,
		});
	},
});

// Mark conversation as read
export const markAsRead = mutation({
	args: { conversationId: v.id("conversations") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation) throw new Error("Conversation not found");

		const hasAccess = await checkAccountAccess(
			ctx,
			userId,
			conversation.accountId,
		);
		if (!hasAccess) throw new Error("Unauthorized");

		await ctx.db.patch(args.conversationId, { unreadCount: 0 });
	},
});

// Update the 24-hour customer service window (internal only)
export const updateWindow = internalMutation({
	args: {
		conversationId: v.id("conversations"),
		windowExpiresAt: v.number(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.conversationId, {
			windowExpiresAt: args.windowExpiresAt,
		});
	},
});

// Get or create conversation (internal only — called from webhook processing)
export const getOrCreateInternal = internalMutation({
	args: {
		accountId: v.id("accounts"),
		contactId: v.id("contacts"),
	},
	handler: async (ctx, args) => {
		// Check if conversation exists
		const existing = await ctx.db
			.query("conversations")
			.withIndex("by_contact", (q) => q.eq("contactId", args.contactId))
			.first();

		if (existing) return existing._id;

		// Create new conversation
		return ctx.db.insert("conversations", {
			accountId: args.accountId,
			contactId: args.contactId,
			unreadCount: 0,
		});
	},
});
