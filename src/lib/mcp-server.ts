import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

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

function getConvexUrl(): string {
	const url = process.env.NEXT_PUBLIC_CONVEX_URL;
	if (!url) {
		throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
	}
	return url;
}

// Helper to call the gateway action — all auth happens inside
async function callTool(
	convex: ConvexHttpClient,
	apiKey: string,
	tool: string,
	toolArgs: Record<string, unknown>,
): Promise<unknown> {
	try {
		return await convex.action(api.gateway.mcpTool, { apiKey, tool, toolArgs });
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.error(`[pons-mcp] callTool("${tool}") failed:`, msg);
		throw error;
	}
}

// Create a new MCP server instance for each request
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
		"List recent WhatsApp conversations with contacts",
		{
			limit: z
				.number()
				.optional()
				.describe("Max conversations to return (default 50)"),
		},
		async ({ limit }) => {
			try {
				const conversations = (await callTool(
					convex,
					apiKey,
					"list_conversations",
					{ limit: limit ?? 50 },
				)) as Array<{
					id: Id<"conversations">;
					contactName: string;
					contactPhone: string;
					lastMessageAt?: number;
					lastMessagePreview?: string;
					unreadCount: number;
					windowOpen: boolean;
				}>;

				const text = conversations
					.map((c) => {
						const time = c.lastMessageAt
							? new Date(c.lastMessageAt).toISOString()
							: "Never";
						const unread =
							c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : "";
						const window = c.windowOpen ? " [24h window open]" : "";
						return `- ${c.contactName} (${c.contactPhone})${unread}${window}\n  Last: ${c.lastMessagePreview ?? "No messages"} at ${time}\n  ID: ${c.id}`;
					})
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: text || "No conversations found.",
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Error listing conversations: ${msg}` }],
					isError: true,
				};
			}
		},
	);

	// ============================================
	// Tool: list_unanswered
	// ============================================
	server.tool(
		"list_unanswered",
		"List conversations waiting for a reply — where the last message is from the customer. Use this to quickly see what needs attention.",
		{
			limit: z
				.number()
				.optional()
				.describe("Max conversations to return (default 20)"),
		},
		async ({ limit }) => {
			try {
				const conversations = (await callTool(
					convex,
					apiKey,
					"list_unanswered",
					{
						limit: limit ?? 20,
					},
				)) as Array<{
					id: Id<"conversations">;
					contactName: string;
					contactPhone: string;
					lastMessageAt?: number;
					lastMessagePreview?: string;
					unreadCount: number;
					windowOpen: boolean;
					lastInboundMessage: {
						id: Id<"messages">;
						waMessageId: string;
						text?: string;
						type: string;
						timestamp: number;
					};
				}>;

				if (conversations.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "All caught up — no unanswered conversations.",
							},
						],
					};
				}

				const text = conversations
					.map((c) => {
						const ago = c.lastMessageAt
							? formatTimeAgo(c.lastMessageAt)
							: "";
						const window = c.windowOpen
							? " [window open]"
							: " [window closed — template required]";
						const unread =
							c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : "";
						return `- **${c.contactName}** (${c.contactPhone})${unread}${window}
  Last message (${ago}): "${c.lastInboundMessage.text ?? `[${c.lastInboundMessage.type}]`}"
  Conversation ID: ${c.id}
  Message ID: ${c.lastInboundMessage.waMessageId}`;
					})
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `${conversations.length} conversation(s) waiting for reply:\n\n${text}`,
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{ type: "text", text: `Error listing unanswered: ${msg}` },
					],
					isError: true,
				};
			}
		},
	);

	// ============================================
	// Tool: get_conversation
	// ============================================
	server.tool(
		"get_conversation",
		"Get a conversation with its recent messages",
		{
			conversationId: z.string().describe("The conversation ID"),
			messageLimit: z
				.number()
				.optional()
				.describe("Max messages to return (default 50)"),
		},
		async ({ conversationId, messageLimit }) => {
			try {
				const conversation = (await callTool(
					convex,
					apiKey,
					"get_conversation",
					{
						conversationId,
						messageLimit: messageLimit ?? 50,
					},
				)) as {
					id: Id<"conversations">;
					contact: { id?: Id<"contacts">; name: string; phone: string };
					windowOpen: boolean;
					windowExpiresAt?: number;
					messages: Array<{
						id: Id<"messages">;
						waMessageId: string;
						direction: string;
						type: string;
						text?: string;
						timestamp: number;
						status: string;
					}>;
				} | null;

				if (!conversation) {
					return {
						content: [{ type: "text", text: "Conversation not found." }],
					};
				}

				const windowStatus =
					conversation.windowOpen && conversation.windowExpiresAt
						? `Open until ${new Date(conversation.windowExpiresAt).toISOString()}`
						: "Closed (template required)";

				const messagesText = conversation.messages
					.map((m) => {
						const dir = m.direction === "inbound" ? "←" : "→";
						const time = new Date(m.timestamp).toISOString();
						const status =
							m.direction === "outbound" ? ` [${m.status}]` : "";
						return `${dir} [${time}]${status} ${m.text ?? `[${m.type}]`}`;
					})
					.join("\n");

				const text = `Contact: ${conversation.contact.name} (${conversation.contact.phone})
24-hour Window: ${windowStatus}

Messages:
${messagesText || "No messages yet."}`;

				return {
					content: [{ type: "text", text }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{ type: "text", text: `Error getting conversation: ${msg}` },
					],
					isError: true,
				};
			}
		},
	);

	// ============================================
	// Tool: search_messages
	// ============================================
	server.tool(
		"search_messages",
		"Search for messages containing specific text",
		{
			query: z.string().describe("Text to search for in messages"),
			limit: z.number().optional().describe("Max results (default 20)"),
		},
		async ({ query, limit }) => {
			try {
				const results = (await callTool(convex, apiKey, "search_messages", {
					query,
					limit: limit ?? 20,
				})) as Array<{
					id: Id<"messages">;
					conversationId: Id<"conversations">;
					contactName: string;
					contactPhone: string;
					direction: string;
					type: string;
					text?: string;
					timestamp: number;
				}>;

				const text = results
					.map((m) => {
						const dir = m.direction === "inbound" ? "←" : "→";
						const time = new Date(m.timestamp).toISOString();
						return `${dir} ${m.contactName} (${m.contactPhone}) at ${time}:\n  "${m.text}"\n  Conversation: ${m.conversationId}`;
					})
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: text || `No messages found matching "${query}".`,
						},
					],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{ type: "text", text: `Error searching messages: ${msg}` },
					],
					isError: true,
				};
			}
		},
	);

	// ============================================
	// Tool: send_text
	// ============================================
	server.tool(
		"send_text",
		"Send a text message to a WhatsApp contact. Requires an open 24-hour window or use send_template for first contact.",
		{
			phone: z
				.string()
				.describe("Phone number in E.164 format (e.g., +491234567890)"),
			text: z.string().describe("Message text to send"),
			replyToMessageId: z
				.string()
				.optional()
				.describe("WhatsApp message ID to reply to (optional)"),
		},
		async ({ phone, text, replyToMessageId }) => {
			try {
				const result = (await callTool(convex, apiKey, "send_text", {
					phone,
					text,
					replyToMessageId,
				})) as { messageId: Id<"messages">; waMessageId: string };

				return {
					content: [
						{
							type: "text",
							text: `Message sent successfully!\nMessage ID: ${result.waMessageId}`,
						},
					],
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				if (errorMessage.includes("outside") || errorMessage.includes("24")) {
					return {
						content: [
							{
								type: "text",
								text: "Failed to send: 24-hour messaging window is closed. Use send_template to send a template message first, which will open a new conversation window when the customer responds.",
							},
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: `Failed to send message: ${errorMessage}`,
						},
					],
				};
			}
		},
	);

	// ============================================
	// Tool: send_template
	// ============================================
	server.tool(
		"send_template",
		"Send a pre-approved template message. Use this for first contact or when the 24-hour window is closed.",
		{
			phone: z
				.string()
				.describe("Phone number in E.164 format (e.g., +491234567890)"),
			templateName: z.string().describe("Name of the approved template"),
			templateLanguage: z
				.string()
				.describe("Language code (e.g., en_US, de_DE)"),
			components: z
				.any()
				.optional()
				.describe(
					"Template components (header, body, button variables) as JSON",
				),
		},
		async ({ phone, templateName, templateLanguage, components }) => {
			try {
				const result = (await callTool(convex, apiKey, "send_template", {
					phone,
					templateName,
					templateLanguage,
					components,
				})) as { messageId: Id<"messages">; waMessageId: string };

				return {
					content: [
						{
							type: "text",
							text: `Template message sent successfully!\nTemplate: ${templateName}\nMessage ID: ${result.waMessageId}`,
						},
					],
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				return {
					content: [
						{
							type: "text",
							text: `Failed to send template: ${errorMessage}`,
						},
					],
				};
			}
		},
	);

	// ============================================
	// Tool: list_templates
	// ============================================
	server.tool(
		"list_templates",
		"List available message templates for this account",
		{},
		async () => {
			try {
				const templates = (await callTool(
					convex,
					apiKey,
					"list_templates",
					{},
				)) as Array<{
					id: Id<"templates">;
					name: string;
					language: string;
					category: string;
					status: string;
				}>;

				if (templates.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No templates found. Templates must be created and approved in the Meta Business Suite.",
							},
						],
					};
				}

				const text = templates
					.map(
						(t) =>
							`- ${t.name} (${t.language}) [${t.status}]\n  Category: ${t.category}\n  ID: ${t.id}`,
					)
					.join("\n\n");

				return {
					content: [{ type: "text", text }],
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{ type: "text", text: `Error listing templates: ${msg}` },
					],
					isError: true,
				};
			}
		},
	);

	// ============================================
	// Tool: mark_as_read
	// ============================================
	server.tool(
		"mark_as_read",
		"Mark a message as read (sends read receipt to sender)",
		{
			waMessageId: z
				.string()
				.describe("The WhatsApp message ID (wamid.xxx) to mark as read"),
		},
		async ({ waMessageId }) => {
			try {
				await callTool(convex, apiKey, "mark_as_read", { waMessageId });

				return {
					content: [
						{
							type: "text",
							text: `Message marked as read: ${waMessageId}`,
						},
					],
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				return {
					content: [
						{
							type: "text",
							text: `Failed to mark as read: ${errorMessage}`,
						},
					],
				};
			}
		},
	);

	// ============================================
	// Tool: send_reaction
	// ============================================
	server.tool(
		"send_reaction",
		"React to a message with an emoji",
		{
			conversationId: z.string().describe("The conversation ID"),
			phone: z
				.string()
				.describe("Phone number of the recipient in E.164 format"),
			waMessageId: z.string().describe("The WhatsApp message ID to react to"),
			emoji: z.string().describe("Emoji to react with (e.g., 👍, ❤️, 😂)"),
		},
		async ({ conversationId, phone, waMessageId, emoji }) => {
			try {
				await callTool(convex, apiKey, "send_reaction", {
					conversationId,
					phone,
					waMessageId,
					emoji,
				});

				return {
					content: [
						{
							type: "text",
							text: `Reaction ${emoji} sent to message ${waMessageId}`,
						},
					],
				};
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				return {
					content: [
						{
							type: "text",
							text: `Failed to send reaction: ${errorMessage}`,
						},
					],
				};
			}
		},
	);

	return server;
}
