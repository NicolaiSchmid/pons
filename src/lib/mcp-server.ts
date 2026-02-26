import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

// ── Helpers ────────────────────────────────────────────────

function getConvexUrl(): string {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
	return url;
}

/** Disclosure response from gateway — all params optional, missing → options list. */
type DisclosureResponse = {
	readonly _disclosure: true;
	readonly parameter: string;
	readonly message: string;
	readonly options: ReadonlyArray<Record<string, unknown>>;
};

/** Check if a gateway result is a disclosure (self-documenting help). */
const isDisclosure = (result: unknown): result is DisclosureResponse =>
	typeof result === "object" &&
	result !== null &&
	"_disclosure" in result &&
	(result as Record<string, unknown>)._disclosure === true;

/** Check if a gateway result is an error. */
const isGatewayError = (
	result: unknown,
): result is { error: true; message: string } =>
	typeof result === "object" &&
	result !== null &&
	"error" in result &&
	(result as Record<string, unknown>).error === true;

/** Format a disclosure response as user-friendly text. */
const formatDisclosure = (d: DisclosureResponse): string => {
	const lines = [d.message];

	if (d.options.length > 0) {
		lines.push("");
		for (const opt of d.options) {
			// Try to create a sensible one-liner from the option object
			const phone = opt.phone as string | undefined;
			const name = opt.name as string | undefined;
			const lastMessageAt = opt.lastMessageAt as number | undefined;

			if (phone && name) {
				const ago = lastMessageAt
					? ` (last msg: ${new Date(lastMessageAt).toISOString()})`
					: "";
				lines.push(`  • ${phone} — ${name}${ago}`);
			} else if (
				opt.waMessageId &&
				(opt.text !== undefined || opt.type !== undefined)
			) {
				// Message disclosure for reactions
				const dir = opt.direction === "inbound" ? "←" : "→";
				const time = opt.timestamp
					? new Date(opt.timestamp as number).toISOString()
					: "";
				lines.push(
					`  ${dir} [${time}] ${opt.text ?? `[${opt.type}]`}  (waMessageId: ${opt.waMessageId})`,
				);
			} else {
				// Fallback: template or generic object
				const summary = Object.entries(opt)
					.filter(([, v]) => typeof v === "string" || typeof v === "number")
					.map(([k, v]) => `${k}: ${v}`)
					.join(", ");
				lines.push(`  • ${summary}`);
			}
		}
	}

	return lines.join("\n");
};

/**
 * Call the gateway action. Returns the raw result — disclosures and errors
 * are handled by each tool's formatting logic.
 */
async function callTool(
	convex: ConvexHttpClient,
	apiKey: string,
	tool: string,
	toolArgs: Record<string, unknown>,
): Promise<unknown> {
	try {
		const result = await convex.action(api.gateway.mcpTool, {
			apiKey,
			tool,
			toolArgs,
		});

		// Disclosures are NOT errors — return them for formatting
		if (isDisclosure(result)) return result;

		// Gateway returns { error: true, message } instead of throwing
		if (isGatewayError(result)) {
			// Check for template error with recovery data
			if ("availableTemplates" in (result as Record<string, unknown>)) {
				return result; // Let the tool handler format it
			}
			throw new Error(result.message);
		}

		return result;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[pons-mcp] callTool("${tool}") failed:`, msg);
		throw error;
	}
}

/** Standard MCP text response. */
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

/** Standard MCP error response. */
const err = (msg: string) => ({
	content: [{ type: "text" as const, text: msg }],
	isError: true,
});

/** Wrap a tool handler — auto-formats disclosures and catches errors. */
const handleResult = (
	result: unknown,
	formatter: (data: unknown) => string,
): { content: Array<{ type: "text"; text: string }>; isError?: boolean } => {
	if (isDisclosure(result)) return text(formatDisclosure(result));
	if (isGatewayError(result)) return err(result.message);
	return text(formatter(result));
};

// ── Self-documenting tool descriptions ─────────────────────

const SELF_DOC =
	"All parameters are optional — omit any parameter to see available options for it.";

const FROM_DESC =
	'Your WhatsApp sender phone number (e.g. "+493023324724"). Omit to see available accounts.';

const PHONE_DESC =
	'Recipient phone number in E.164 format (e.g. "+491234567890"). Omit to see recent contacts.';

// ── Server factory ─────────────────────────────────────────

export function createMcpServer(apiKey: string) {
	const convex = new ConvexHttpClient(getConvexUrl());

	const server = new McpServer({
		name: "pons-whatsapp",
		version: "1.0.0",
	});

	// ============================================
	// Tool: list_conversations
	// ============================================
	server.tool(
		"list_conversations",
		`List recent WhatsApp conversations with contacts. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			limit: z
				.number()
				.optional()
				.describe("Max conversations to return (default 50)"),
		},
		async ({ from, limit }) => {
			try {
				const result = await callTool(convex, apiKey, "list_conversations", {
					from,
					limit: limit ?? 50,
				});

				return handleResult(result, (data) => {
					const conversations = data as Array<{
						id: string;
						contactName: string;
						contactPhone: string;
						lastMessageAt?: number;
						lastMessagePreview?: string;
						unreadCount: number;
						windowOpen: boolean;
					}>;

					if (conversations.length === 0) return "No conversations found.";

					return conversations
						.map((c) => {
							const time = c.lastMessageAt
								? new Date(c.lastMessageAt).toISOString()
								: "Never";
							const unread =
								c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : "";
							const window = c.windowOpen ? " [24h window open]" : "";
							return `- ${c.contactName} (${c.contactPhone})${unread}${window}\n  Last: ${c.lastMessagePreview ?? "No messages"} at ${time}`;
						})
						.join("\n\n");
				});
			} catch (error) {
				return err(
					`Error listing conversations: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: list_unanswered
	// ============================================
	server.tool(
		"list_unanswered",
		`List conversations waiting for a reply — where the last message is from the customer. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			limit: z
				.number()
				.optional()
				.describe("Max conversations to return (default 20)"),
		},
		async ({ from, limit }) => {
			try {
				const result = await callTool(convex, apiKey, "list_unanswered", {
					from,
					limit: limit ?? 20,
				});

				return handleResult(result, (data) => {
					const conversations = data as Array<{
						id: string;
						contactName: string;
						contactPhone: string;
						lastMessageAt?: number;
						unreadCount: number;
						windowOpen: boolean;
						lastInboundMessage: {
							waMessageId: string;
							text?: string;
							type: string;
							timestamp: number;
						};
					}>;

					if (conversations.length === 0)
						return "All caught up — no unanswered conversations.";

					const lines = conversations.map((c) => {
						const ago = c.lastMessageAt ? formatTimeAgo(c.lastMessageAt) : "";
						const window = c.windowOpen
							? " [window open]"
							: " [window closed — template required]";
						const unread =
							c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : "";
						return `- **${c.contactName}** (${c.contactPhone})${unread}${window}
  Last message (${ago}): "${c.lastInboundMessage.text ?? `[${c.lastInboundMessage.type}]`}"
  Message ID: ${c.lastInboundMessage.waMessageId}`;
					});

					return `${conversations.length} conversation(s) waiting for reply:\n\n${lines.join("\n\n")}`;
				});
			} catch (error) {
				return err(
					`Error listing unanswered: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: get_conversation
	// ============================================
	server.tool(
		"get_conversation",
		`Get a conversation with its recent messages. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			phone: z.string().optional().describe(PHONE_DESC),
			messageLimit: z
				.number()
				.optional()
				.describe("Max messages to return (default 50)"),
		},
		async ({ from, phone, messageLimit }) => {
			try {
				const result = await callTool(convex, apiKey, "get_conversation", {
					from,
					phone,
					messageLimit: messageLimit ?? 50,
				});

				return handleResult(result, (data) => {
					const conversation = data as {
						contact: { name: string; phone: string };
						windowOpen: boolean;
						windowExpiresAt?: number;
						messages: Array<{
							waMessageId: string;
							direction: string;
							type: string;
							text?: string;
							timestamp: number;
							status: string;
						}>;
					} | null;

					if (!conversation) return "Conversation not found.";

					const windowStatus =
						conversation.windowOpen && conversation.windowExpiresAt
							? `Open until ${new Date(conversation.windowExpiresAt).toISOString()}`
							: "Closed (template required)";

					const messagesText = conversation.messages
						.map((m) => {
							const dir = m.direction === "inbound" ? "←" : "→";
							const time = new Date(m.timestamp).toISOString();
							const status = m.direction === "outbound" ? ` [${m.status}]` : "";
							return `${dir} [${time}]${status} ${m.text ?? `[${m.type}]`}  (${m.waMessageId})`;
						})
						.join("\n");

					return `Contact: ${conversation.contact.name} (${conversation.contact.phone})
24-hour Window: ${windowStatus}

Messages:
${messagesText || "No messages yet."}`;
				});
			} catch (error) {
				return err(
					`Error getting conversation: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: search_messages
	// ============================================
	server.tool(
		"search_messages",
		`Search for messages containing specific text. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			query: z
				.string()
				.optional()
				.describe("Text to search for in messages. Omit to see instructions."),
			limit: z.number().optional().describe("Max results (default 20)"),
		},
		async ({ from, query, limit }) => {
			try {
				const result = await callTool(convex, apiKey, "search_messages", {
					from,
					query,
					limit: limit ?? 20,
				});

				return handleResult(result, (data) => {
					const results = data as Array<{
						contactName: string;
						contactPhone: string;
						direction: string;
						text?: string;
						timestamp: number;
					}>;

					if (results.length === 0)
						return `No messages found matching "${query}".`;

					return results
						.map((m) => {
							const dir = m.direction === "inbound" ? "←" : "→";
							const time = new Date(m.timestamp).toISOString();
							return `${dir} ${m.contactName} (${m.contactPhone}) at ${time}:\n  "${m.text}"`;
						})
						.join("\n\n");
				});
			} catch (error) {
				return err(
					`Error searching messages: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: list_templates
	// ============================================
	server.tool(
		"list_templates",
		`List available message templates for this account. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
		},
		async ({ from }) => {
			try {
				const result = await callTool(convex, apiKey, "list_templates", {
					from,
				});

				return handleResult(result, (data) => {
					const templates = data as Array<{
						name: string;
						language: string;
						category: string;
						status: string;
						components: Array<{ type: string; text?: string }>;
					}>;

					if (templates.length === 0)
						return "No templates found. Templates must be created and approved in the Meta Business Suite.";

					const VAR_RE = /\{\{(\w+)\}\}/g;

					return templates
						.map((t) => {
							const lines: string[] = [
								`- ${t.name} (${t.language}) [${t.status}]`,
								`  Category: ${t.category}`,
							];

							// Show body text and extract variables per component
							for (const c of t.components) {
								const cType = (c.type ?? "").toUpperCase();
								if (!c.text) continue;
								lines.push(`  ${cType}: ${c.text}`);
								const vars = [...c.text.matchAll(VAR_RE)]
									.map((m) => m[1])
									.filter((v): v is string => v != null);
								if (vars.length > 0) {
									const isNamed = vars.some((v) => !/^\d+$/.test(v));
									lines.push(
										`  Variables (${cType}): ${vars.map((v) => `{{${v}}}`).join(", ")}${isNamed ? " [NAMED — parameter_name required]" : " [POSITIONAL]"}`,
									);
								}
							}

							return lines.join("\n");
						})
						.join("\n\n");
				});
			} catch (error) {
				return err(
					`Error listing templates: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: send_text
	// ============================================
	server.tool(
		"send_text",
		`Send a text message to a WhatsApp contact. Requires an open 24-hour window or use send_template for first contact. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			phone: z.string().optional().describe(PHONE_DESC),
			text: z
				.string()
				.optional()
				.describe("Message text to send. Omit to see instructions."),
			replyToMessageId: z
				.string()
				.optional()
				.describe("WhatsApp message ID to reply to (optional)"),
		},
		async ({ from, phone, text: msgText, replyToMessageId }) => {
			try {
				const result = await callTool(convex, apiKey, "send_text", {
					from,
					phone,
					text: msgText,
					replyToMessageId,
				});

				return handleResult(result, (data) => {
					const r = data as {
						messageId: string;
						waMessageId: string;
					};
					return `Message sent successfully!\nMessage ID: ${r.waMessageId}`;
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				if (msg.includes("outside") || msg.includes("24")) {
					return text(
						"Failed to send: 24-hour messaging window is closed. Use send_template to send a template message first, which will open a new conversation window when the customer responds.",
					);
				}
				return err(`Failed to send message: ${msg}`);
			}
		},
	);

	// ============================================
	// Tool: send_template
	// ============================================
	server.tool(
		"send_template",
		`Send a pre-approved template message. Use this for first contact or when the 24-hour window is closed. Use list_templates first to see available templates and their variables. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			phone: z.string().optional().describe(PHONE_DESC),
			templateName: z
				.string()
				.optional()
				.describe(
					"Name of the approved template. Omit to see available templates.",
				),
			templateLanguage: z
				.string()
				.optional()
				.describe(
					'Language code (e.g., "en_US", "de_DE"). Omit to see instructions.',
				),
			components: z
				.array(
					z
						.object({
							type: z.string().transform((t) => t.toUpperCase()),
							parameters: z.array(
								z
									.object({
										type: z.string(),
										text: z.string().optional(),
										parameter_name: z.string().optional(),
									})
									.passthrough(),
							),
						})
						.passthrough(),
				)
				.optional()
				.describe(
					"Template components with variable values. Use list_templates to see which variables a template needs. " +
						"For NAMED variables (e.g. {{name}}, {{city}}): each parameter MUST include parameter_name matching the variable. " +
						"For POSITIONAL variables (e.g. {{1}}, {{2}}): omit parameter_name, order matters. " +
						'Example (named): [{"type":"BODY","parameters":[{"type":"text","text":"Alice","parameter_name":"name"},{"type":"text","text":"Berlin","parameter_name":"city"}]}]',
				),
		},
		async ({ from, phone, templateName, templateLanguage, components }) => {
			try {
				const result = await callTool(convex, apiKey, "send_template", {
					from,
					phone,
					templateName,
					templateLanguage,
					components,
				});

				// Handle template send failure with recovery data
				if (
					isGatewayError(result) &&
					"availableTemplates" in (result as Record<string, unknown>)
				) {
					const r = result as unknown as {
						message: string;
						availableTemplates: Array<{
							name: string;
							language: string;
							status: string;
							components: Array<{ type: string; text?: string }>;
						}>;
					};
					const templateList = (r.availableTemplates ?? [])
						.map((t) => {
							const body = t.components.find(
								(c) => c.type === "BODY" || c.type === "body",
							);
							return `  • ${t.name} (${t.language}) [${t.status}]${body?.text ? `\n    Body: ${body.text}` : ""}`;
						})
						.join("\n");
					return err(`${r.message}\n\nAvailable templates:\n${templateList}`);
				}

				return handleResult(result, (data) => {
					const r = data as { waMessageId: string };
					return `Template message sent successfully!\nTemplate: ${templateName}\nMessage ID: ${r.waMessageId}`;
				});
			} catch (error) {
				return err(
					`Failed to send template: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	// ============================================
	// Tool: send_media
	// ============================================
	server.tool(
		"send_media",
		`Send a media file (image, document, video, audio) to a WhatsApp contact. Provide a publicly accessible URL. Requires an open 24-hour window. ${SELF_DOC}`,
		{
			from: z.string().optional().describe(FROM_DESC),
			phone: z.string().optional().describe(PHONE_DESC),
			url: z
				.string()
				.optional()
				.describe(
					"Publicly accessible URL of the file to send. Omit to see instructions.",
				),
			mimeType: z
				.string()
				.optional()
				.describe(
					'MIME type of the file (e.g. "image/jpeg", "application/pdf", "video/mp4", "audio/ogg").',
				),
			filename: z
				.string()
				.optional()
				.describe(
					'Display filename for documents (e.g. "report.pdf"). Optional for images/video/audio.',
				),
			caption: z
				.string()
				.optional()
				.describe("Optional caption to send with the media."),
		},
		async ({ from, phone, url, mimeType, filename, caption }) => {
			try {
				const result = await callTool(convex, apiKey, "send_media", {
					from,
					phone,
					url,
					mimeType,
					filename,
					caption,
				});

				return handleResult(result, (data) => {
					const r = data as {
						messageId: string;
						waMessageId: string;
					};
					return `Media sent successfully!\nMessage ID: ${r.waMessageId}`;
				});
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				if (msg.includes("outside") || msg.includes("24")) {
					return text(
						"Failed to send: 24-hour messaging window is closed. Use send_template to send a template message first.",
					);
				}
				return err(`Failed to send media: ${msg}`);
			}
		},
	);

	// ============================================
	// Tool: send_reaction
	// ============================================
	server.tool(
		"send_reaction",
		`React to a message with an emoji. ${SELF_DOC} The "phone" and "conversationId" are resolved automatically from the waMessageId.`,
		{
			from: z.string().optional().describe(FROM_DESC),
			phone: z
				.string()
				.optional()
				.describe(
					"Recipient phone number. Only needed if omitting waMessageId (to see recent messages). Resolved automatically when waMessageId is provided.",
				),
			waMessageId: z
				.string()
				.optional()
				.describe(
					"The WhatsApp message ID to react to. Omit (with phone) to see recent messages.",
				),
			emoji: z
				.string()
				.optional()
				.describe(
					'Emoji to react with (e.g., "\u{1F44D}", "\u2764\uFE0F", "\u{1F602}")',
				),
		},
		async ({ from, phone, waMessageId, emoji }) => {
			try {
				const result = await callTool(convex, apiKey, "send_reaction", {
					from,
					phone,
					waMessageId,
					emoji,
				});

				return handleResult(result, (data) => {
					const r = data as { waMessageId?: string };
					return `Reaction ${emoji} sent to message ${waMessageId}${r.waMessageId ? ` (reaction ID: ${r.waMessageId})` : ""}`;
				});
			} catch (error) {
				return err(
					`Failed to send reaction: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
	);

	return server;
}

// ── Utility ────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
	const seconds = Math.floor((Date.now() - timestamp) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
