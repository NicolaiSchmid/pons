import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { auth } from "./auth";

const META_API_VERSION = "v22.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

/** Structured Meta Graph API error response. */
type MetaApiError = {
	message: string;
	type?: string;
	code: number;
	error_subcode?: number;
	error_data?: { details?: string };
	fbtrace_id?: string;
};

type MetaMessagesResponse = {
	messages?: Array<{ id: string }>;
	error?: MetaApiError;
};

/**
 * Build an actionable error message from a Meta API error.
 * Detects well-known error codes and appends remediation hints.
 */
const formatMetaError = (error: MetaApiError | undefined): string => {
	if (!error) return "Unknown Meta API error";

	const base = `Meta API error #${error.code}${error.error_subcode ? ` (subcode ${error.error_subcode})` : ""}: ${error.message}`;

	// #133010 — Phone number not registered with Cloud API
	if (
		error.error_subcode === 133010 ||
		error.message.includes("not registered")
	) {
		return `${base}\n\nThe WhatsApp phone number is not registered with the Cloud API. Register it first:\n1. Go to pons.chat and complete the phone registration flow, OR\n2. Call POST /{phone_number_id}/register with messaging_product=whatsapp and a 6-digit pin.`;
	}

	// #131030 — Recipient phone number not on WhatsApp
	if (error.error_subcode === 131030) {
		return `${base}\n\nThe recipient phone number is not a valid WhatsApp user.`;
	}

	// #132000 — Template not found / not approved
	if (error.code === 132000 || error.error_subcode === 2388093) {
		return `${base}\n\nThe template was not found or is not approved. Check the template name and language code.`;
	}

	return base;
};

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
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
				},
			);

			const data = (await response.json()) as MetaMessagesResponse;

			if (!response.ok) {
				const errorMsg = formatMetaError(data.error);
				await ctx.runMutation(internal.messages.updateAfterSend, {
					messageId,
					waMessageId: `failed_${Date.now()}`,
					status: "failed",
					errorCode: data.error?.code?.toString(),
					errorMessage: errorMsg,
				});
				throw new Error(errorMsg);
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

		console.log(
			`sendTemplateMessage: accountId=${args.accountId}, phoneNumberId=${account.phoneNumberId}, ownerId=${account.ownerId}, status=${account.status}, to=${args.to}, template=${args.templateName}, tokenPrefix=${accessToken.substring(0, 20)}...`,
		);

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
						Authorization: `Bearer ${accessToken}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
				},
			);

			const data = (await response.json()) as MetaMessagesResponse;

			if (!response.ok) {
				const errorMsg = formatMetaError(data.error);
				await ctx.runMutation(internal.messages.updateAfterSend, {
					messageId,
					waMessageId: `failed_${Date.now()}`,
					status: "failed",
					errorCode: data.error?.code?.toString(),
					errorMessage: errorMsg,
				});
				throw new Error(errorMsg);
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
		if (!account.phoneNumberId) {
			throw new Error("Account has no phone number ID");
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

		const response = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
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
		if (!account.phoneNumberId) {
			throw new Error("Account has no phone number ID");
		}

		const accessToken = await resolveAccessToken(ctx, account.ownerId);

		const response = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/messages`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
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
	error?: MetaApiError;
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
			`${META_API_BASE}/${account.wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components`;

		while (url) {
			const response = await fetch(url, {
				headers: { Authorization: `Bearer ${accessToken}` },
			});
			const data = (await response.json()) as MetaTemplatesResponse;

			if (!response.ok || data.error) {
				throw new Error(
					formatMetaError(data.error) || "Failed to fetch templates from Meta",
				);
			}

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
		components: v.optional(v.any()),
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
