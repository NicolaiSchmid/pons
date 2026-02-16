/**
 * Gateway actions — the ONLY public entry points for MCP and webhook flows.
 * Each validates credentials before delegating to internal functions.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

// ============================================
// MCP Gateway — validates API key, then runs tool
// ============================================

/**
 * Single gateway for all MCP tool invocations.
 * Validates the API key, enforces scopes, then dispatches to the right internal function.
 */
export const mcpTool = action({
	args: {
		apiKey: v.string(),
		tool: v.string(),
		toolArgs: v.any(),
	},
	handler: async (ctx, args): Promise<unknown> => {
		// 1. Validate API key
		const keyHash = await ctx.runAction(internal.mcpNode.hashApiKeyAction, {
			apiKey: args.apiKey,
		});
		const validation = await ctx.runQuery(internal.mcp.validateApiKeyInternal, {
			keyHash,
		});
		if (!validation) {
			throw new Error("Invalid or expired API key");
		}

		const { accountId, scopes, keyId } = validation;

		// Update last used (fire and forget)
		void ctx.runMutation(internal.mcp.updateApiKeyLastUsed, { keyId });

		// 2. Enforce scopes
		const readTools = [
			"list_conversations",
			"list_unanswered",
			"get_conversation",
			"search_messages",
			"list_templates",
		];
		const sendTools = [
			"send_text",
			"send_template",
			"mark_as_read",
			"send_reaction",
		];

		// Reject unknown tools before checking scopes — prevents future tools
		// from bypassing scope enforcement if they're added to the switch but
		// not to the scope arrays.
		if (!readTools.includes(args.tool) && !sendTools.includes(args.tool)) {
			throw new Error(`Unknown tool: ${args.tool}`);
		}

		if (readTools.includes(args.tool) && !scopes.includes("read")) {
			throw new Error(
				`API key does not have "read" scope for tool: ${args.tool}`,
			);
		}
		if (sendTools.includes(args.tool) && !scopes.includes("send")) {
			throw new Error(
				`API key does not have "send" scope for tool: ${args.tool}`,
			);
		}

		// 3. Dispatch to internal functions
		const toolArgs = args.toolArgs as Record<string, unknown>;

		switch (args.tool) {
			case "list_conversations": {
				return ctx.runQuery(internal.mcp.listConversationsInternal, {
					accountId,
					limit: (toolArgs.limit as number | undefined) ?? 50,
				});
			}
			case "list_unanswered": {
				return ctx.runQuery(internal.mcp.listUnansweredInternal, {
					accountId,
					limit: (toolArgs.limit as number | undefined) ?? 20,
				});
			}
			case "get_conversation": {
				return ctx.runQuery(internal.mcp.getConversationInternal, {
					accountId,
					conversationId: toolArgs.conversationId as Id<"conversations">,
					messageLimit: (toolArgs.messageLimit as number | undefined) ?? 50,
				});
			}
			case "search_messages": {
				return ctx.runQuery(internal.mcp.searchMessagesInternal, {
					accountId,
					query: toolArgs.query as string,
					limit: (toolArgs.limit as number | undefined) ?? 20,
				});
			}
			case "list_templates": {
				return ctx.runQuery(internal.mcp.listTemplatesInternal, {
					accountId,
				});
			}
			case "send_text": {
				const contact = await ctx.runMutation(internal.mcp.getOrCreateContact, {
					accountId,
					phone: toolArgs.phone as string,
					name: toolArgs.name as string | undefined,
				});

				return ctx.runAction(internal.whatsapp.sendTextMessage, {
					accountId,
					conversationId: contact.conversationId,
					to: toolArgs.phone as string,
					text: toolArgs.text as string,
					replyToMessageId: toolArgs.replyToMessageId as string | undefined,
				});
			}
			case "send_template": {
				const templateContact = await ctx.runMutation(
					internal.mcp.getOrCreateContact,
					{
						accountId,
						phone: toolArgs.phone as string,
					},
				);

				return ctx.runAction(internal.whatsapp.sendTemplateMessage, {
					accountId,
					conversationId: templateContact.conversationId,
					to: toolArgs.phone as string,
					templateName: toolArgs.templateName as string,
					templateLanguage: toolArgs.templateLanguage as string,
					components: toolArgs.components,
				});
			}
			case "mark_as_read": {
				return ctx.runAction(internal.whatsapp.markAsRead, {
					accountId,
					waMessageId: toolArgs.waMessageId as string,
				});
			}
			case "send_reaction": {
				return ctx.runAction(internal.whatsapp.sendReaction, {
					accountId,
					conversationId: toolArgs.conversationId as Id<"conversations">,
					to: toolArgs.phone as string,
					messageId: toolArgs.waMessageId as string,
					emoji: toolArgs.emoji as string,
				});
			}
			default:
				throw new Error(`Unknown tool: ${args.tool}`);
		}
	},
});

// ============================================
// Webhook Gateway — validates signature, then ingests
// ============================================

/**
 * Verify webhook signature and ingest messages.
 * The signature is verified inside Convex using the Node runtime and the FACEBOOK_APP_SECRET env var.
 */
export const webhookIngest = action({
	args: {
		phoneNumberId: v.string(),
		rawBody: v.string(),
		signature: v.string(),
		payload: v.any(),
	},
	handler: async (ctx, args): Promise<void> => {
		// Look up account — use a generic error for both "not found" and
		// "invalid signature" to prevent phone number ID enumeration.
		const account = await ctx.runQuery(
			internal.accounts.getByPhoneNumberIdInternal,
			{ phoneNumberId: args.phoneNumberId },
		);

		if (!account) {
			throw new Error("Webhook verification failed");
		}

		// Only process webhooks for active/pending_name_review accounts
		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			// Silently drop — the number might still be registering
			return;
		}

		// Verify HMAC-SHA256 signature (runs in Node runtime inside Convex)
		const isValid = await ctx.runAction(
			internal.mcpNode.verifyWebhookSignature,
			{
				rawBody: args.rawBody,
				signature: args.signature,
			},
		);

		if (!isValid) {
			throw new Error("Webhook verification failed");
		}

		// Ingest the webhook payload (signature is not stored — it's
		// already been verified and storing it would increase data surface
		// area in case of a database breach)
		await ctx.runMutation(internal.webhook.ingestWebhook, {
			phoneNumberId: args.phoneNumberId,
			payload: args.payload,
		});
	},
});

/**
 * Verify and ingest a webhook status update.
 */
export const webhookStatusUpdate = action({
	args: {
		phoneNumberId: v.string(),
		rawBody: v.string(),
		signature: v.string(),
		waMessageId: v.string(),
		status: v.string(),
		timestamp: v.number(),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args): Promise<void> => {
		// Use a generic error for both "not found" and "invalid signature"
		// to prevent phone number ID enumeration.
		const account = await ctx.runQuery(
			internal.accounts.getByPhoneNumberIdInternal,
			{ phoneNumberId: args.phoneNumberId },
		);

		if (!account) {
			throw new Error("Webhook verification failed");
		}

		// Only process for active accounts
		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			return;
		}

		// Verify signature
		const isValid = await ctx.runAction(
			internal.mcpNode.verifyWebhookSignature,
			{
				rawBody: args.rawBody,
				signature: args.signature,
			},
		);

		if (!isValid) {
			throw new Error("Webhook verification failed");
		}

		await ctx.runMutation(internal.webhook.ingestStatusUpdate, {
			waMessageId: args.waMessageId,
			status: args.status,
			timestamp: args.timestamp,
			errorCode: args.errorCode,
			errorMessage: args.errorMessage,
		});
	},
});
