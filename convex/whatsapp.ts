import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { auth } from "./auth";

const META_API_VERSION = "v22.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// Send a text message (internal — called from MCP gateway or UI actions)
export const sendTextMessage = internalAction({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		to: v.string(), // Phone number in E.164 format
		text: v.string(),
		replyToMessageId: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ messageId: Id<"messages">; waMessageId: string }> => {
		// Get account for API credentials
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		// Create message record
		const messageId = await ctx.runMutation(
			internal.messages.createOutboundInternal,
			{
				accountId: args.accountId,
				conversationId: args.conversationId,
				type: "text",
				text: args.text,
				contextMessageId: args.replyToMessageId,
			},
		);

		// Build API request
		const body: Record<string, unknown> = {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: args.to,
			type: "text",
			text: { body: args.text },
		};

		if (args.replyToMessageId) {
			body.context = { message_id: args.replyToMessageId };
		}

		try {
			const response = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/messages`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${account.accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
				},
			);

			const data = (await response.json()) as {
				messages?: Array<{ id: string }>;
				error?: { code: number; message: string };
			};

			if (!response.ok) {
				await ctx.runMutation(internal.messages.updateAfterSend, {
					messageId,
					waMessageId: `failed_${Date.now()}`,
					status: "failed",
					errorCode: data.error?.code?.toString(),
					errorMessage: data.error?.message,
				});
				throw new Error(data.error?.message ?? "Failed to send message");
			}

			const waMessageId = data.messages?.[0]?.id ?? `unknown_${Date.now()}`;
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId,
				status: "sent",
			});

			// Update conversation
			await ctx.runMutation(internal.conversations.updateLastMessage, {
				conversationId: args.conversationId,
				preview: args.text,
				timestamp: Date.now(),
				incrementUnread: false,
			});

			return { messageId, waMessageId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId: `failed_${Date.now()}`,
				status: "failed",
				errorMessage,
			});
			throw error;
		}
	},
});

// Send a template message (internal — called from MCP gateway or UI actions)
export const sendTemplateMessage = internalAction({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		to: v.string(),
		templateName: v.string(),
		templateLanguage: v.string(),
		components: v.optional(v.any()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ messageId: Id<"messages">; waMessageId: string }> => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const messageId = await ctx.runMutation(
			internal.messages.createOutboundInternal,
			{
				accountId: args.accountId,
				conversationId: args.conversationId,
				type: "template",
				templateName: args.templateName,
				templateLanguage: args.templateLanguage,

				templateComponents: args.components,
			},
		);

		const body: Record<string, unknown> = {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: args.to,
			type: "template",
			template: {
				name: args.templateName,
				language: { code: args.templateLanguage },

				components: args.components,
			},
		};

		try {
			const response = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/messages`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${account.accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
				},
			);

			const data = (await response.json()) as {
				messages?: Array<{ id: string }>;
				error?: { code: number; message: string };
			};

			if (!response.ok) {
				await ctx.runMutation(internal.messages.updateAfterSend, {
					messageId,
					waMessageId: `failed_${Date.now()}`,
					status: "failed",
					errorCode: data.error?.code?.toString(),
					errorMessage: data.error?.message,
				});
				throw new Error(data.error?.message ?? "Failed to send template");
			}

			const waMessageId = data.messages?.[0]?.id ?? `unknown_${Date.now()}`;
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId,
				status: "sent",
			});

			await ctx.runMutation(internal.conversations.updateLastMessage, {
				conversationId: args.conversationId,
				preview: `[Template: ${args.templateName}]`,
				timestamp: Date.now(),
				incrementUnread: false,
			});

			return { messageId, waMessageId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId: `failed_${Date.now()}`,
				status: "failed",
				errorMessage,
			});
			throw error;
		}
	},
});

// Download media from Meta and store in Convex
// This is an internal action called from the webhook handler
export const downloadMedia = internalAction({
	args: {
		mediaUrl: v.string(),
		accessToken: v.string(),
		mimeType: v.string(),
	},
	handler: async (ctx, args): Promise<Id<"_storage">> => {
		// Meta media URLs expire in 5 minutes, so download immediately
		const response = await fetch(args.mediaUrl, {
			headers: {
				Authorization: `Bearer ${args.accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to download media: ${response.status}`);
		}

		const blob = await response.blob();

		// Store in Convex file storage
		const storageId = await ctx.storage.store(blob);

		return storageId;
	},
});

// Get media info from Meta (to get download URL)
export const getMediaInfo = internalAction({
	args: {
		mediaId: v.string(),
		accessToken: v.string(),
	},
	handler: async (
		_ctx,
		args,
	): Promise<{
		url: string;
		mimeType: string;
		fileSize: number;
		sha256: string;
	}> => {
		const response = await fetch(`${META_API_BASE}/${args.mediaId}`, {
			headers: {
				Authorization: `Bearer ${args.accessToken}`,
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to get media info: ${response.status}`);
		}

		const data = (await response.json()) as {
			url: string;
			mime_type: string;
			file_size: number;
			sha256: string;
		};

		return {
			url: data.url,
			mimeType: data.mime_type,
			fileSize: data.file_size,
			sha256: data.sha256,
		};
	},
});

// Mark a message as read (internal — called from MCP gateway or UI actions)
export const markAsRead = internalAction({
	args: {
		accountId: v.id("accounts"),
		waMessageId: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean }> => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const response = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${account.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messaging_product: "whatsapp",
					status: "read",
					message_id: args.waMessageId,
				}),
			},
		);

		if (!response.ok) {
			const data = (await response.json()) as {
				error?: { message: string };
			};
			throw new Error(data.error?.message ?? "Failed to mark as read");
		}

		return { success: true };
	},
});

// Send a reaction (internal — called from MCP gateway or UI actions)
export const sendReaction = internalAction({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		to: v.string(),
		messageId: v.string(),
		emoji: v.string(),
	},
	handler: async (ctx, args): Promise<{ waMessageId: string | undefined }> => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const response = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${account.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					messaging_product: "whatsapp",
					recipient_type: "individual",
					to: args.to,
					type: "reaction",
					reaction: {
						message_id: args.messageId,
						emoji: args.emoji,
					},
				}),
			},
		);

		const data = (await response.json()) as {
			messages?: Array<{ id: string }>;
			error?: { message: string };
		};

		if (!response.ok) {
			throw new Error(data.error?.message ?? "Failed to send reaction");
		}

		return { waMessageId: data.messages?.[0]?.id };
	},
});

// ============================================
// Public UI wrappers — validate user auth, then delegate to internal actions
// ============================================

export const sendTextMessageUI = action({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		to: v.string(),
		text: v.string(),
		replyToMessageId: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ messageId: Id<"messages">; waMessageId: string }> => {
		// Verify user is authenticated and has access to the account
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.runQuery(
			internal.accounts.checkMembership,
			{ accountId: args.accountId, userId },
		);
		if (!membership) throw new Error("Access denied");

		return ctx.runAction(internal.whatsapp.sendTextMessage, args);
	},
});

export const sendTemplateMessageUI = action({
	args: {
		accountId: v.id("accounts"),
		conversationId: v.id("conversations"),
		to: v.string(),
		templateName: v.string(),
		templateLanguage: v.string(),
		components: v.optional(v.any()),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ messageId: Id<"messages">; waMessageId: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.runQuery(
			internal.accounts.checkMembership,
			{ accountId: args.accountId, userId },
		);
		if (!membership) throw new Error("Access denied");

		return ctx.runAction(internal.whatsapp.sendTemplateMessage, args);
	},
});
