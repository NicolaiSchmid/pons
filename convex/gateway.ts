/**
 * Gateway actions — the ONLY public entry points for MCP and webhook flows.
 * Each validates credentials before delegating to internal functions.
 *
 * Self-documenting: every parameter is optional. Omit any parameter
 * and the gateway returns the available options for it (_disclosure response).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";

// ── Types ──────────────────────────────────────────────────

/** Returned when a required parameter is missing — lists available options. */
type Disclosure = {
	readonly _disclosure: true;
	readonly parameter: string;
	readonly message: string;
	readonly options: ReadonlyArray<Record<string, unknown>>;
};

const disclosure = (
	parameter: string,
	message: string,
	options: ReadonlyArray<Record<string, unknown>>,
): Disclosure => ({ _disclosure: true, parameter, message, options });

// ── Helpers ────────────────────────────────────────────────

const VAR_RE = /\{\{(\w+)\}\}/g;

/**
 * Resolve a template's body text by substituting variable placeholders
 * with the actual parameter values from the Meta API components array.
 */
const resolveTemplateBodyText = (
	templateComponents: Array<{ type: string; text?: string }>,
	metaComponents:
		| Array<{
				type: string;
				parameters?: Array<{
					type: string;
					text?: string;
					parameter_name?: string;
				}>;
		  }>
		| undefined,
): string | undefined => {
	const bodyComp = templateComponents.find(
		(c) => c.type === "BODY" || c.type === "body",
	);
	if (!bodyComp?.text) return undefined;

	if (!metaComponents || metaComponents.length === 0) return bodyComp.text;

	// Extract variables from body text to map positional params
	const bodyVars: string[] = [];
	for (const m of bodyComp.text.matchAll(VAR_RE)) {
		if (m[1]) bodyVars.push(m[1]);
	}

	// Build values map from Meta components
	const values: Record<string, string> = {};
	for (const comp of metaComponents) {
		const compType = (comp.type ?? "").toUpperCase();
		if (compType !== "BODY") continue;
		for (let i = 0; i < (comp.parameters?.length ?? 0); i++) {
			const param = comp.parameters?.[i];
			if (!param?.text) continue;
			if (param.parameter_name) {
				values[param.parameter_name] = param.text;
			} else {
				const varKey = bodyVars[i];
				if (varKey) values[varKey] = param.text;
			}
		}
	}

	return bodyComp.text.replace(VAR_RE, (match, key: string) => {
		return values[key]?.trim() || match;
	});
};

/** Resolve `from` (sender phone) → accountId, or return a disclosure. */
const resolveFrom = async (
	ctx: { runQuery: (fn: any, args: any) => Promise<any> },
	userId: string,
	from: string | undefined,
): Promise<{ accountId: Id<"accounts"> } | Disclosure> => {
	if (!from) {
		const accounts = await ctx.runQuery(internal.mcp.listAccountsForUser, {
			userId,
		});
		return disclosure(
			"from",
			'Omit "from" — here are your WhatsApp accounts. Pass one as the "from" parameter.',
			accounts,
		);
	}

	const result = await ctx.runQuery(internal.mcp.resolveAccountByPhone, {
		userId,
		phone: from,
	});

	if ("error" in result) {
		return disclosure("from", result.error as string, []);
	}

	return { accountId: result.accountId as Id<"accounts"> };
};

/** Resolve `phone` (recipient) → conversationId + contact info, or return a disclosure listing contacts. */
const resolveRecipient = async (
	ctx: { runQuery: (fn: any, args: any) => Promise<any> },
	accountId: Id<"accounts">,
	phone: string | undefined,
): Promise<
	| {
			conversationId: Id<"conversations">;
			contactPhone: string;
			contactName: string;
	  }
	| Disclosure
> => {
	if (!phone) {
		const contacts = await ctx.runQuery(internal.mcp.listContactsForAccount, {
			accountId,
		});
		return disclosure(
			"phone",
			'Omit "phone" — here are recent contacts. Pass one as the "phone" parameter.',
			contacts,
		);
	}

	const resolved = await ctx.runQuery(internal.mcp.resolveConversationByPhone, {
		accountId,
		phone,
	});

	if (!resolved) {
		// Not found — still allow sending (new contact will be created)
		return {
			conversationId: "" as Id<"conversations">,
			contactPhone: phone,
			contactName: "New contact",
		};
	}

	return {
		conversationId: resolved.conversationId as Id<"conversations">,
		contactPhone: resolved.contactPhone as string,
		contactName: resolved.contactName as string,
	};
};

// ============================================
// MCP Gateway — validates API key, then runs tool
// ============================================

/**
 * Single gateway for all MCP tool invocations.
 * Validates the API key (user-scoped), then dispatches to the right internal function.
 *
 * Every tool uses `from` (sender phone number) instead of phoneNumberId.
 * Every tool that targets a contact uses `phone` (recipient phone) instead of conversationId.
 * All parameters are optional — omit any to receive available options.
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

		const { userId, scopes, keyId } = validation;

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
			"send_reaction",
			"send_media",
		];
		const writeTools = ["updateConversation"];

		if (
			!readTools.includes(args.tool) &&
			!sendTools.includes(args.tool) &&
			!writeTools.includes(args.tool)
		) {
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
		if (writeTools.includes(args.tool) && !scopes.includes("write")) {
			throw new Error(
				`API key does not have "write" scope for tool: ${args.tool}`,
			);
		}

		// 3. Resolve `from` → accountId (all tools need this)
		const toolArgs = args.toolArgs as Record<string, unknown>;
		const fromResult = await resolveFrom(
			ctx,
			userId as string,
			toolArgs.from as string | undefined,
		);
		if ("_disclosure" in fromResult) return fromResult;

		const { accountId } = fromResult;

		// 4. Dispatch to internal functions
		try {
			switch (args.tool) {
				// ── Read tools ──────────────────────────────────────

				case "list_conversations": {
					return await ctx.runQuery(internal.mcp.listConversationsInternal, {
						accountId,
						limit: (toolArgs.limit as number | undefined) ?? 50,
					});
				}

				case "list_unanswered": {
					return await ctx.runQuery(internal.mcp.listUnansweredInternal, {
						accountId,
						limit: (toolArgs.limit as number | undefined) ?? 20,
					});
				}

				case "get_conversation": {
					const recipient = await resolveRecipient(
						ctx,
						accountId,
						toolArgs.phone as string | undefined,
					);
					if ("_disclosure" in recipient) return recipient;

					// If no conversation exists yet, return empty
					if (!recipient.conversationId) {
						return {
							contact: {
								name: recipient.contactName,
								phone: recipient.contactPhone,
							},
							messages: [],
							windowOpen: false,
						};
					}

					return await ctx.runQuery(internal.mcp.getConversationInternal, {
						accountId,
						conversationId: recipient.conversationId,
						messageLimit: (toolArgs.messageLimit as number | undefined) ?? 50,
					});
				}

				case "search_messages": {
					const query = toolArgs.query as string | undefined;
					if (!query) {
						return disclosure(
							"query",
							'Pass a "query" string to search messages across all conversations.',
							[],
						);
					}
					return await ctx.runQuery(internal.mcp.searchMessagesInternal, {
						accountId,
						query,
						limit: (toolArgs.limit as number | undefined) ?? 20,
					});
				}

				case "list_templates": {
					return await ctx.runAction(internal.whatsapp.fetchTemplates, {
						accountId,
					});
				}

				// ── Send tools ──────────────────────────────────────

				case "send_text": {
					const phone = toolArgs.phone as string | undefined;
					if (!phone) {
						const contacts = await ctx.runQuery(
							internal.mcp.listContactsForAccount,
							{ accountId },
						);
						return disclosure(
							"phone",
							'Pass "phone" (E.164 format) — the recipient\'s phone number.',
							contacts,
						);
					}

					const text = toolArgs.text as string | undefined;
					if (!text) {
						return disclosure(
							"text",
							'Pass "text" — the message content to send.',
							[],
						);
					}

					const contact = await ctx.runMutation(
						internal.mcp.getOrCreateContact,
						{
							accountId,
							phone,
							name: toolArgs.name as string | undefined,
						},
					);

					return await ctx.runAction(internal.whatsapp.sendTextMessage, {
						accountId,
						conversationId: contact.conversationId,
						to: phone,
						text,
						replyToMessageId: toolArgs.replyToMessageId as string | undefined,
					});
				}

				case "send_template": {
					const phone = toolArgs.phone as string | undefined;
					if (!phone) {
						const contacts = await ctx.runQuery(
							internal.mcp.listContactsForAccount,
							{ accountId },
						);
						return disclosure(
							"phone",
							'Pass "phone" (E.164 format) — the recipient\'s phone number.',
							contacts,
						);
					}

					const templateName = toolArgs.templateName as string | undefined;
					if (!templateName) {
						// Auto-disclose available templates
						const templates = await ctx.runAction(
							internal.whatsapp.fetchTemplates,
							{ accountId },
						);
						return disclosure(
							"templateName",
							'Omit "templateName" — here are available templates. Pass one as "templateName".',
							(templates as Array<Record<string, unknown>>) ?? [],
						);
					}

					const templateLanguage = toolArgs.templateLanguage as
						| string
						| undefined;
					if (!templateLanguage) {
						return disclosure(
							"templateLanguage",
							'Pass "templateLanguage" — e.g. "en_US", "de_DE".',
							[],
						);
					}

					// ── Validate components against template variables ──
					// Fetch the template to know what variables it expects
					const templates = await ctx.runAction(
						internal.whatsapp.fetchTemplates,
						{ accountId },
					);
					const matchedTemplate = (
						templates as Array<{
							name: string;
							components: Array<{ type: string; text?: string }>;
						}>
					).find((t) => t.name === templateName);

					if (matchedTemplate) {
						const VAR_RE = /\{\{(\w+)\}\}/g;
						const expectedVars: Array<{
							key: string;
							componentType: string;
							isNamed: boolean;
						}> = [];
						for (const c of matchedTemplate.components) {
							if (!c.text) continue;
							for (const m of c.text.matchAll(VAR_RE)) {
								const key = m[1];
								if (key) {
									expectedVars.push({
										key,
										componentType: c.type.toUpperCase(),
										isNamed: !/^\d+$/.test(key),
									});
								}
							}
						}

						const firstVar = expectedVars[0];
						if (expectedVars.length > 0 && firstVar) {
							const components = toolArgs.components as
								| Array<{
										type: string;
										parameters?: Array<{
											type: string;
											text?: string;
											parameter_name?: string;
										}>;
								  }>
								| undefined;

							// No components provided but template needs them
							if (!components || components.length === 0) {
								const hasNamed = expectedVars.some((v) => v.isNamed);
								return {
									error: true,
									message: `Template "${templateName}" requires variables but no components were provided.`,
									requiredVariables: expectedVars.map((v) => ({
										variable: `{{${v.key}}}`,
										componentType: v.componentType,
										parameterFormat: v.isNamed ? "NAMED" : "POSITIONAL",
									})),
									example: hasNamed
										? [
												{
													type: firstVar.componentType,
													parameters: expectedVars
														.filter(
															(v) => v.componentType === firstVar.componentType,
														)
														.map((v) => ({
															type: "text",
															text: `<${v.key}>`,
															parameter_name: v.isNamed ? v.key : undefined,
														})),
												},
											]
										: [
												{
													type: firstVar.componentType,
													parameters: expectedVars
														.filter(
															(v) => v.componentType === firstVar.componentType,
														)
														.map((_v) => ({ type: "text", text: "<value>" })),
												},
											],
								};
							}

							// Components provided — check for missing parameter_name on named vars
							const hasNamed = expectedVars.some((v) => v.isNamed);
							if (hasNamed) {
								for (const comp of components) {
									const compType = (comp.type ?? "").toUpperCase();
									const compVars = expectedVars.filter(
										(v) => v.componentType === compType && v.isNamed,
									);
									if (compVars.length === 0) continue;

									for (const param of comp.parameters ?? []) {
										if (!param.parameter_name) {
											return {
												error: true,
												message: `Template "${templateName}" uses NAMED parameters — each parameter must include "parameter_name". Missing on: ${JSON.stringify(param)}`,
												requiredVariables: compVars.map((v) => ({
													variable: `{{${v.key}}}`,
													componentType: v.componentType,
													parameter_name: v.key,
												})),
												example: [
													{
														type: compType,
														parameters: compVars.map((v) => ({
															type: "text",
															text: `<${v.key}>`,
															parameter_name: v.key,
														})),
													},
												],
											};
										}
									}
								}
							}
						}
					}

					const templateContact = await ctx.runMutation(
						internal.mcp.getOrCreateContact,
						{ accountId, phone },
					);

					// Resolve the template body text with variables filled in
					const resolvedText = matchedTemplate
						? resolveTemplateBodyText(
								matchedTemplate.components,
								toolArgs.components as
									| Array<{
											type: string;
											parameters?: Array<{
												type: string;
												text?: string;
												parameter_name?: string;
											}>;
									  }>
									| undefined,
							)
						: undefined;

					try {
						return await ctx.runAction(internal.whatsapp.sendTemplateMessage, {
							accountId,
							conversationId: templateContact.conversationId,
							to: phone,
							templateName,
							templateLanguage,
							components: toolArgs.components,
							text: resolvedText,
						});
					} catch (sendError) {
						// On failure, auto-return templates list for recovery
						const templates = await ctx.runAction(
							internal.whatsapp.fetchTemplates,
							{ accountId },
						);
						const msg =
							sendError instanceof Error
								? sendError.message
								: String(sendError);
						return {
							error: true,
							message: `Failed to send template "${templateName}": ${msg}`,
							availableTemplates: templates,
						};
					}
				}

				case "send_media": {
					const phone = toolArgs.phone as string | undefined;
					if (!phone) {
						const contacts = await ctx.runQuery(
							internal.mcp.listContactsForAccount,
							{ accountId },
						);
						return disclosure(
							"phone",
							'Pass "phone" (E.164 format) — the recipient\'s phone number.',
							contacts,
						);
					}

					const url = toolArgs.url as string | undefined;
					if (!url) {
						return disclosure(
							"url",
							'Pass "url" — a publicly accessible URL of the file to send (image, document, video, or audio).',
							[],
						);
					}

					const mimeType = toolArgs.mimeType as string | undefined;
					if (!mimeType) {
						return disclosure(
							"mimeType",
							'Pass "mimeType" — the MIME type of the file (e.g. "image/jpeg", "application/pdf", "video/mp4").',
							[],
						);
					}

					// Download the file from the URL
					const fileResponse = await fetch(url);
					if (!fileResponse.ok) {
						return {
							error: true,
							message: `Failed to download file from URL (${fileResponse.status}): ${fileResponse.statusText}`,
						};
					}

					const blob = await fileResponse.blob();

					// Store in Convex file storage
					const storageId = await ctx.storage.store(
						new Blob([blob], { type: mimeType }),
					);

					const mediaContact = await ctx.runMutation(
						internal.mcp.getOrCreateContact,
						{ accountId, phone },
					);

					return await ctx.runAction(internal.whatsapp.sendMediaMessage, {
						accountId,
						conversationId: mediaContact.conversationId,
						to: phone,
						storageId,
						mimeType,
						filename: (toolArgs.filename as string | undefined) ?? undefined,
						caption: (toolArgs.caption as string | undefined) ?? undefined,
					});
				}

				case "send_reaction": {
					const waMessageId = toolArgs.waMessageId as string | undefined;

					if (!waMessageId) {
						// Need phone to show recent messages
						const phone = toolArgs.phone as string | undefined;
						if (!phone) {
							const contacts = await ctx.runQuery(
								internal.mcp.listContactsForAccount,
								{ accountId },
							);
							return disclosure(
								"phone",
								'To react, first provide "phone" (recipient) so I can show recent messages, or provide "waMessageId" directly.',
								contacts,
							);
						}

						const messages = await ctx.runQuery(
							internal.mcp.getRecentMessagesByPhone,
							{ accountId, phone },
						);
						return disclosure(
							"waMessageId",
							`Here are the last ${messages.length} messages. Pass one's waMessageId to react.`,
							messages as unknown as ReadonlyArray<Record<string, unknown>>,
						);
					}

					const emoji = toolArgs.emoji as string | undefined;
					if (!emoji) {
						return disclosure(
							"emoji",
							'Pass "emoji" — the emoji to react with (e.g. "\u{1F44D}", "\u2764\uFE0F", "\u{1F602}").',
							[],
						);
					}

					// Resolve phone + conversationId from the waMessageId
					const resolved = await ctx.runQuery(
						internal.mcp.resolveMessageByWaId,
						{ accountId, waMessageId },
					);

					if (!resolved) {
						return {
							error: true,
							message: `Message "${waMessageId}" not found in this account.`,
						};
					}

					return await ctx.runAction(internal.whatsapp.sendReaction, {
						accountId,
						conversationId: resolved.conversationId as Id<"conversations">,
						to: resolved.contactPhone as string,
						messageId: waMessageId,
						emoji,
					});
				}

				case "updateConversation": {
					const recipient = await resolveRecipient(
						ctx,
						accountId,
						toolArgs.phone as string | undefined,
					);
					if ("_disclosure" in recipient) return recipient;

					if (!recipient.conversationId) {
						return {
							error: true,
							message:
								"Conversation not found for this phone number yet. The contact needs an existing chat before it can be updated.",
						};
					}

					const archived = toolArgs.archived as boolean | undefined;
					if (typeof archived !== "boolean") {
						return disclosure(
							"archived",
							'Pass "archived": true to archive or false to unarchive.',
							[{ archived: true }, { archived: false }],
						);
					}

					return await ctx.runMutation(
						internal.mcp.updateConversationInternal,
						{
							accountId,
							conversationId: recipient.conversationId,
							archived,
						},
					);
				}

				default:
					throw new Error(`Unknown tool: ${args.tool}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return { error: true, message };
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

		// Ingest the webhook payload
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
		const account = await ctx.runQuery(
			internal.accounts.getByPhoneNumberIdInternal,
			{ phoneNumberId: args.phoneNumberId },
		);

		if (!account) {
			throw new Error("Webhook verification failed");
		}

		if (
			account.status !== "active" &&
			account.status !== "pending_name_review"
		) {
			return;
		}

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
