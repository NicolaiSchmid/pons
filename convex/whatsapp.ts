import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { auth } from "./auth";
import { MetaApiRequestError, metaFetch } from "./metaFetch";

type MetaMessagesResponse = {
	messages?: Array<{ id: string }>;
};

// Strict validator for template components — rejects lowercase types.
// Meta API requires UPPERCASE component types (BODY, HEADER, FOOTER, BUTTONS).
const templateComponentValidator = v.array(
	v.object({
		type: v.union(
			v.literal("BODY"),
			v.literal("HEADER"),
			v.literal("FOOTER"),
			v.literal("BUTTONS"),
			v.literal("BUTTON"),
		),
		parameters: v.optional(
			v.array(
				v.object({
					type: v.string(),
					text: v.optional(v.string()),
					parameter_name: v.optional(v.string()),
				}),
			),
		),
		sub_type: v.optional(v.string()),
		index: v.optional(v.union(v.string(), v.number())),
	}),
);

/**
 * Resolve the Facebook OAuth token for an account's owner.
 * Used in actions that can't access the DB directly.
 */
// biome-ignore lint/suspicious/noExplicitAny: Convex action ctx type is complex
async function resolveAccessToken(ctx: any, ownerId: string): Promise<string> {
	const token: string | null = await ctx.runQuery(
		internal.whatsappDiscovery.getFacebookToken,
		{ userId: ownerId },
	);
	if (!token) {
		throw new Error(
			"No Facebook access token found for account owner. The owner needs to re-authenticate.",
		);
	}
	return token;
}

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
		if (!account.phoneNumberId) {
			throw new Error(
				"Account has no phone number ID — registration may be incomplete",
			);
		}
		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			throw new Error(`Account is not active (status: ${account.status})`);
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

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

		// Build API request body
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
			const data = await metaFetch<MetaMessagesResponse>(
				`${account.phoneNumberId}/messages`,
				accessToken,
				{ method: "POST", body, tokenInBody: false },
			);

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

			// Send read receipt for the last inbound message
			const lastInboundWaId = await ctx.runQuery(
				internal.messages.lastInboundWaMessageId,
				{ conversationId: args.conversationId },
			);
			if (lastInboundWaId) {
				await metaFetch<{ success: boolean }>(
					`${account.phoneNumberId}/messages`,
					accessToken,
					{
						method: "POST",
						body: {
							messaging_product: "whatsapp",
							status: "read",
							message_id: lastInboundWaId,
						},
						tokenInBody: false,
					},
				);
			}

			return { messageId, waMessageId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const errorCode =
				error instanceof MetaApiRequestError
					? error.meta.code.toString()
					: undefined;
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId: `failed_${Date.now()}`,
				status: "failed",
				errorCode,
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
		if (!account.phoneNumberId) {
			throw new Error(
				"Account has no phone number ID — registration may be incomplete",
			);
		}
		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			throw new Error(`Account is not active (status: ${account.status})`);
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

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

		const template: Record<string, unknown> = {
			name: args.templateName,
			language: { code: args.templateLanguage },
		};
		if (Array.isArray(args.components) && args.components.length > 0) {
			// Meta API requires component types in UPPERCASE (e.g. "BODY", "HEADER").
			// Normalize here as a safety net regardless of caller.
			template.components = args.components.map(
				(c: Record<string, unknown>) => ({
					...c,
					type: typeof c.type === "string" ? c.type.toUpperCase() : c.type,
				}),
			);
		}

		const body: Record<string, unknown> = {
			messaging_product: "whatsapp",
			recipient_type: "individual",
			to: args.to,
			type: "template",
			template,
		};

		try {
			const data = await metaFetch<MetaMessagesResponse>(
				`${account.phoneNumberId}/messages`,
				accessToken,
				{ method: "POST", body, tokenInBody: false },
			);

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

			// Send read receipt for the last inbound message
			const lastInboundWaId = await ctx.runQuery(
				internal.messages.lastInboundWaMessageId,
				{ conversationId: args.conversationId },
			);
			if (lastInboundWaId) {
				await metaFetch<{ success: boolean }>(
					`${account.phoneNumberId}/messages`,
					accessToken,
					{
						method: "POST",
						body: {
							messaging_product: "whatsapp",
							status: "read",
							message_id: lastInboundWaId,
						},
						tokenInBody: false,
					},
				);
			}

			return { messageId, waMessageId };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const errorCode =
				error instanceof MetaApiRequestError
					? error.meta.code.toString()
					: undefined;
			await ctx.runMutation(internal.messages.updateAfterSend, {
				messageId,
				waMessageId: `failed_${Date.now()}`,
				status: "failed",
				errorCode,
				errorMessage,
			});
			throw error;
		}
	},
});

// Download media from Meta and store in Convex
// This is an internal action called from the webhook handler
// NOTE: Binary download — intentionally NOT using metaFetch (which is JSON-only)
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
		const data = await metaFetch<{
			url: string;
			mime_type: string;
			file_size: number;
			sha256: string;
		}>(args.mediaId, args.accessToken, { tokenInBody: false });

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
		if (!account.phoneNumberId) {
			throw new Error("Account has no phone number ID");
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

		await metaFetch<{ success: boolean }>(
			`${account.phoneNumberId}/messages`,
			accessToken,
			{
				method: "POST",
				body: {
					messaging_product: "whatsapp",
					status: "read",
					message_id: args.waMessageId,
				},
				tokenInBody: false,
			},
		);

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
		if (!account.phoneNumberId) {
			throw new Error("Account has no phone number ID");
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

		const data = await metaFetch<MetaMessagesResponse>(
			`${account.phoneNumberId}/messages`,
			accessToken,
			{
				method: "POST",
				body: {
					messaging_product: "whatsapp",
					recipient_type: "individual",
					to: args.to,
					type: "reaction",
					reaction: {
						message_id: args.messageId,
						emoji: args.emoji,
					},
				},
				tokenInBody: false,
			},
		);

		return { waMessageId: data.messages?.[0]?.id };
	},
});

// ============================================
// Fetch templates directly from Meta API
// ============================================

/** Meta template component shape (simplified) */
type MetaTemplateComponent = {
	type: string; // HEADER, BODY, FOOTER, BUTTONS
	format?: string; // TEXT, IMAGE, VIDEO, DOCUMENT
	text?: string;
	buttons?: Array<{
		type: string;
		text: string;
		url?: string;
		phone_number?: string;
	}>;
	example?: { body_text?: string[][] };
};

/** Meta template from GET /{WABA_ID}/message_templates */
type MetaTemplate = {
	id: string;
	name: string;
	language: string;
	category: string;
	status: string;
	components: MetaTemplateComponent[];
};

type MetaTemplatesResponse = {
	data?: MetaTemplate[];
	paging?: { cursors?: { after?: string }; next?: string };
};

/** Normalized template shape returned to callers. */
export type Template = {
	id: string;
	name: string;
	language: string;
	category: string;
	status: string;
	components: MetaTemplateComponent[];
};

export const fetchTemplates = internalAction({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args): Promise<Template[]> => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

		const allTemplates: Template[] = [];
		let url: string | null =
			`${account.wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components`;

		while (url) {
			const data: MetaTemplatesResponse =
				await metaFetch<MetaTemplatesResponse>(url, accessToken, {
					tokenInBody: false,
				});

			for (const t of data.data ?? []) {
				allTemplates.push({
					id: t.id,
					name: t.name,
					language: t.language,
					category: t.category.toLowerCase(),
					status: t.status.toLowerCase(),
					components: t.components ?? [],
				});
			}

			// Pagination: `next` is a full URL — metaFetch handles it
			url = data.paging?.next ?? null;
		}

		return allTemplates;
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

		const membership = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
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
		// Strict: rejects lowercase component types — our TemplatePicker
		// must send UPPERCASE. This catches bugs at the boundary.
		components: v.optional(templateComponentValidator),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ messageId: Id<"messages">; waMessageId: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!membership) throw new Error("Access denied");

		return ctx.runAction(internal.whatsapp.sendTemplateMessage, args);
	},
});

export const fetchTemplatesUI = action({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args): Promise<Template[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!membership) throw new Error("Access denied");

		return ctx.runAction(internal.whatsapp.fetchTemplates, args);
	},
});
