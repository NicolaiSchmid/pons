import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { auth } from "./auth";
import { checkAccountAccess } from "./helpers";

// Message type validator
const messageTypeValidator = v.union(
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
);

const statusValidator = v.union(
	v.literal("pending"),
	v.literal("sent"),
	v.literal("delivered"),
	v.literal("read"),
	v.literal("failed"),
);

// List messages for a conversation
export const list = query({
	args: {
		conversationId: v.id("conversations"),
		limit: v.optional(v.number()),
		cursor: v.optional(v.number()), // timestamp for pagination
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return { messages: [], hasMore: false };

		const conversation = await ctx.db.get(args.conversationId);
		if (!conversation) return { messages: [], hasMore: false };

		const hasAccess = await checkAccountAccess(
			ctx,
			userId,
			conversation.accountId,
		);
		if (!hasAccess) return { messages: [], hasMore: false };

		const limit = args.limit ?? 50;

		const messagesQuery = ctx.db
			.query("messages")
			.withIndex("by_conversation_timestamp", (q) =>
				q.eq("conversationId", args.conversationId),
			)
			.order("desc");

		const messages = await messagesQuery.take(limit + 1);
		const hasMore = messages.length > limit;

		return {
			messages: messages.slice(0, limit).reverse(), // Return in chronological order
			hasMore,
		};
	},
});

// Get a single message
export const get = query({
	args: { messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const message = await ctx.db.get(args.messageId);
		if (!message) return null;

		const hasAccess = await checkAccountAccess(ctx, userId, message.accountId);
		if (!hasAccess) return null;

		return message;
	},
});

// Create an outbound message (for sending)
export const createOutbound = mutation({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		type: messageTypeValidator,
		text: v.optional(v.string()),
		caption: v.optional(v.string()),
		mediaId: v.optional(v.id("_storage")),
		mediaMimeType: v.optional(v.string()),
		mediaFilename: v.optional(v.string()),
		templateName: v.optional(v.string()),
		templateLanguage: v.optional(v.string()),
		templateComponents: v.optional(v.any()),
		contextMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
		if (!hasAccess) throw new Error("Unauthorized");

		const now = Date.now();

		return ctx.db.insert("messages", {
			accountId: args.accountId,
			conversationId: args.conversationId,
			waMessageId: `pending_${now}`, // Will be updated after API call
			direction: "outbound",
			type: args.type,
			text: args.text,
			caption: args.caption,
			mediaId: args.mediaId,
			mediaMimeType: args.mediaMimeType,
			mediaFilename: args.mediaFilename,
			templateName: args.templateName,
			templateLanguage: args.templateLanguage,

			templateComponents: args.templateComponents,
			contextMessageId: args.contextMessageId,
			status: "pending",
			timestamp: now,
		});
	},
});

// Create outbound message (internal only — called from send actions)
export const createOutboundInternal = internalMutation({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		type: messageTypeValidator,
		text: v.optional(v.string()),
		caption: v.optional(v.string()),
		mediaId: v.optional(v.id("_storage")),
		mediaMimeType: v.optional(v.string()),
		mediaFilename: v.optional(v.string()),
		templateName: v.optional(v.string()),
		templateLanguage: v.optional(v.string()),
		templateComponents: v.optional(v.any()),
		contextMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();

		return ctx.db.insert("messages", {
			accountId: args.accountId,
			conversationId: args.conversationId,
			waMessageId: `pending_${now}`,
			direction: "outbound",
			type: args.type,
			text: args.text,
			caption: args.caption,
			mediaId: args.mediaId,
			mediaMimeType: args.mediaMimeType,
			mediaFilename: args.mediaFilename,
			templateName: args.templateName,
			templateLanguage: args.templateLanguage,
			templateComponents: args.templateComponents,
			contextMessageId: args.contextMessageId,
			status: "pending",
			timestamp: now,
		});
	},
});

// Update message after API call (internal only)
export const updateAfterSend = internalMutation({
	args: {
		messageId: v.id("messages"),
		waMessageId: v.string(),
		status: statusValidator,
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { messageId, ...updates } = args;
		await ctx.db.patch(messageId, {
			...updates,
			statusTimestamp: Date.now(),
		});
	},
});

// Update message status (internal only — called from webhook processing)
export const updateStatus = internalMutation({
	args: {
		waMessageId: v.string(),
		status: statusValidator,
		timestamp: v.number(),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const message = await ctx.db
			.query("messages")
			.withIndex("by_wa_message_id", (q) =>
				q.eq("waMessageId", args.waMessageId),
			)
			.first();

		if (!message) return;

		// Only update if status is "higher" (sent < delivered < read)
		const statusOrder = {
			pending: 0,
			sent: 1,
			delivered: 2,
			read: 3,
			failed: 4,
		};
		if (
			statusOrder[args.status] <= statusOrder[message.status] &&
			args.status !== "failed"
		) {
			return;
		}

		await ctx.db.patch(message._id, {
			status: args.status,
			statusTimestamp: args.timestamp,
			errorCode: args.errorCode,
			errorMessage: args.errorMessage,
		});
	},
});

// Create inbound message (internal only — called from webhook processing)
export const createInbound = internalMutation({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		waMessageId: v.string(),
		type: messageTypeValidator,
		timestamp: v.number(),
		text: v.optional(v.string()),
		caption: v.optional(v.string()),
		mediaId: v.optional(v.id("_storage")),
		mediaMimeType: v.optional(v.string()),
		mediaFilename: v.optional(v.string()),
		latitude: v.optional(v.number()),
		longitude: v.optional(v.number()),
		locationName: v.optional(v.string()),
		locationAddress: v.optional(v.string()),
		contactsData: v.optional(v.any()),
		interactiveType: v.optional(v.string()),
		buttonId: v.optional(v.string()),
		buttonText: v.optional(v.string()),
		reactionEmoji: v.optional(v.string()),
		reactionToMessageId: v.optional(v.string()),
		contextMessageId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		// Check if message already exists (deduplication)
		const existing = await ctx.db
			.query("messages")
			.withIndex("by_wa_message_id", (q) =>
				q.eq("waMessageId", args.waMessageId),
			)
			.first();

		if (existing) return existing._id;

		return ctx.db.insert("messages", {
			...args,
			direction: "inbound",
			status: "delivered", // Inbound messages are always delivered
		});
	},
});

// Get media URL for a message
export const getMediaUrl = query({
	args: { messageId: v.id("messages") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const message = await ctx.db.get(args.messageId);
		if (!message?.mediaId) return null;

		const hasAccess = await checkAccountAccess(ctx, userId, message.accountId);
		if (!hasAccess) return null;

		return ctx.storage.getUrl(message.mediaId);
	},
});
