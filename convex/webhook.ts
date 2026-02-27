import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { getOwnerAccessToken } from "./helpers";
import { metaFetch } from "./metaFetch";

// Message types
type MessageType =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "voice"
	| "document"
	| "sticker"
	| "location"
	| "contacts"
	| "interactive"
	| "reaction"
	| "template"
	| "unknown";

// ============================================================================
// PUBLIC MUTATIONS (called from Next.js API route)
// These are durable and retried automatically by Convex
// ============================================================================

/**
 * Store raw webhook payload and schedule processing.
 * Internal only — called from the webhook gateway action.
 * Returns immediately so webhook can respond 200 to Meta.
 */
export const ingestWebhook = internalMutation({
	args: {
		phoneNumberId: v.string(),
		payload: v.any(),
	},
	handler: async (ctx, args) => {
		// Find account to link the log
		const account = await ctx.db
			.query("accounts")
			.withIndex("by_phone_number_id", (q) =>
				q.eq("phoneNumberId", args.phoneNumberId),
			)
			.first();

		// Store raw webhook for debugging and replay
		// Note: signature is intentionally NOT stored — it's already been
		// verified by the gateway and keeping it would widen the data
		// surface area in case of a database breach.
		const logId = await ctx.db.insert("webhookLogs", {
			accountId: account?._id,
			payload: args.payload,
			processed: false,
		});

		// Schedule processing (this ensures it happens even if we crash)
		if (account) {
			await ctx.scheduler.runAfter(0, internal.webhook.processWebhookLog, {
				logId,
				accountId: account._id,
			});
		}

		return { logId, accountId: account?._id };
	},
});

/**
 * Store a status update from webhook (internal only).
 * Durable mutation - retried automatically.
 */
export const ingestStatusUpdate = internalMutation({
	args: {
		waMessageId: v.string(),
		status: v.string(),
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

		if (!message) {
			console.warn("[webhook] Status update for unknown message", {
				waMessageId: args.waMessageId,
				status: args.status,
			});
			return { found: false };
		}

		const statusOrder = {
			pending: 0,
			sent: 1,
			delivered: 2,
			read: 3,
			failed: 4,
		};

		const currentOrder = statusOrder[message.status] ?? 0;
		const newStatus = (
			{
				sent: "sent",
				delivered: "delivered",
				read: "read",
				failed: "failed",
			} as const
		)[args.status];

		if (!newStatus) {
			console.warn("[webhook] Unknown status value", {
				waMessageId: args.waMessageId,
				status: args.status,
			});
			return { found: true, updated: false };
		}

		const newOrder = statusOrder[newStatus];

		// Only update if status is "higher" or it's a failure
		if (newOrder <= currentOrder && newStatus !== "failed") {
			return { found: true, updated: false };
		}

		await ctx.db.patch(message._id, {
			status: newStatus,
			statusTimestamp: args.timestamp,
			errorCode: args.errorCode,
			errorMessage: args.errorMessage,
		});

		await ctx.runMutation(internal.forwarding.enqueueEvent, {
			accountId: message.accountId,
			eventType: "message.status.updated",
			source: "meta_webhook",
			occurredAt: args.timestamp,
			dedupeKey: `${args.waMessageId}:${args.status}:${args.timestamp}`,
			payload: {
				messageId: message._id,
				waMessageId: args.waMessageId,
				direction: message.direction,
				status: newStatus,
				timestamp: args.timestamp,
				errorCode: args.errorCode,
				errorMessage: args.errorMessage,
			},
		});

		return { found: true, updated: true };
	},
});

// ============================================================================
// INTERNAL MUTATIONS (called from scheduler/actions)
// ============================================================================

/**
 * Process a stored webhook log.
 * Called by scheduler - retried on failure.
 */
export const processWebhookLog = internalMutation({
	args: {
		logId: v.id("webhookLogs"),
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const log = await ctx.db.get(args.logId);
		if (!log || log.processed) return;

		const account = await ctx.db.get(args.accountId);
		if (!account) {
			await ctx.db.patch(args.logId, {
				processed: true,
				processedAt: Date.now(),
				error: "Account not found",
			});
			return;
		}

		try {
			// Parse the payload - it contains messages array
			const payload = log.payload as {
				contacts?: Array<{ profile: { name: string }; wa_id: string }>;
				messages?: Array<{
					id: string;
					from: string;
					timestamp: string;
					type: string;
					text?: { body: string };
					image?: { id: string; mime_type: string; caption?: string };
					video?: { id: string; mime_type: string; caption?: string };
					audio?: { id: string; mime_type: string };
					voice?: { id: string; mime_type: string };
					document?: {
						id: string;
						mime_type: string;
						filename?: string;
						caption?: string;
					};
					sticker?: { id: string; mime_type: string };
					location?: {
						latitude: number;
						longitude: number;
						name?: string;
						address?: string;
					};
					contacts?: unknown;
					interactive?: {
						type: string;
						button_reply?: { id: string; title: string };
						list_reply?: { id: string; title: string };
					};
					reaction?: { message_id: string; emoji: string };
					context?: { id?: string; message_id?: string; from?: string };
				}>;
			};

			if (!payload.messages || payload.messages.length === 0) {
				await ctx.db.patch(args.logId, {
					processed: true,
					processedAt: Date.now(),
				});
				return;
			}

			for (const msg of payload.messages) {
				const contactInfo = payload.contacts?.find((c) => c.wa_id === msg.from);

				// Upsert contact
				let contact = await ctx.db
					.query("contacts")
					.withIndex("by_account_wa_id", (q) =>
						q.eq("accountId", args.accountId).eq("waId", msg.from),
					)
					.first();

				if (!contact) {
					const contactId = await ctx.db.insert("contacts", {
						accountId: args.accountId,
						waId: msg.from,
						phone: `+${msg.from}`,
						name: contactInfo?.profile.name,
					});
					contact = await ctx.db.get(contactId);
				} else if (
					contactInfo?.profile.name &&
					contactInfo.profile.name !== contact.name
				) {
					await ctx.db.patch(contact._id, { name: contactInfo.profile.name });
				}

				if (!contact) continue;

				// Upsert conversation
				let conversation = await ctx.db
					.query("conversations")
					.withIndex("by_contact", (q) => q.eq("contactId", contact._id))
					.first();

				if (!conversation) {
					const convId = await ctx.db.insert("conversations", {
						accountId: args.accountId,
						contactId: contact._id,
						unreadCount: 0,
					});
					conversation = await ctx.db.get(convId);
				}

				if (!conversation) continue;

				// Check for duplicate message
				const existingMsg = await ctx.db
					.query("messages")
					.withIndex("by_wa_message_id", (q) => q.eq("waMessageId", msg.id))
					.first();

				if (existingMsg) continue;

				// Map message type
				const typeMap: Record<string, MessageType> = {
					text: "text",
					image: "image",
					video: "video",
					audio: "audio",
					voice: "voice",
					document: "document",
					sticker: "sticker",
					location: "location",
					contacts: "contacts",
					interactive: "interactive",
					reaction: "reaction",
				};
				const messageType = typeMap[msg.type] ?? "unknown";

				// Extract media info
				const media =
					msg.image ??
					msg.video ??
					msg.audio ??
					msg.voice ??
					msg.document ??
					msg.sticker;
				const mediaMetaId = media?.id;
				const mediaMimeType = media?.mime_type;
				const mediaFilename = (msg.document as { filename?: string })?.filename;
				const caption =
					(media as { caption?: string })?.caption ?? msg.text?.body;

				// Store message
				const timestamp = parseInt(msg.timestamp, 10) * 1000;
				const messageId = await ctx.db.insert("messages", {
					accountId: args.accountId,
					conversationId: conversation._id,
					waMessageId: msg.id,
					direction: "inbound",
					type: messageType,
					status: "delivered",
					timestamp,
					text: msg.text?.body,
					caption: (media as { caption?: string })?.caption,
					mediaMimeType,
					mediaFilename,
					latitude: msg.location?.latitude,
					longitude: msg.location?.longitude,
					locationName: msg.location?.name,
					locationAddress: msg.location?.address,
					contactsData: msg.contacts,
					interactiveType: msg.interactive?.type,
					buttonId:
						msg.interactive?.button_reply?.id ??
						msg.interactive?.list_reply?.id,
					buttonText:
						msg.interactive?.button_reply?.title ??
						msg.interactive?.list_reply?.title,
					reactionEmoji: msg.reaction?.emoji,
					reactionToMessageId: msg.reaction?.message_id,
					contextMessageId: msg.context?.id ?? msg.context?.message_id,
				});

				// Update conversation
				let preview = caption ?? "[Message]";
				if (!caption) {
					const typeLabels: Record<string, string> = {
						image: "[Image]",
						video: "[Video]",
						audio: "[Audio]",
						voice: "[Voice message]",
						document: "[Document]",
						sticker: "[Sticker]",
						location: "[Location]",
						contacts: "[Contact]",
						interactive: "[Interactive]",
						reaction: msg.reaction?.emoji ?? "[Reaction]",
					};
					preview = typeLabels[msg.type] ?? "[Message]";
				}

				// 24h window starts from customer message
				const windowExpiresAt = timestamp + 24 * 60 * 60 * 1000;
				const shouldAdvanceConversation =
					!conversation.lastMessageAt ||
					timestamp >= conversation.lastMessageAt;

				await ctx.db.patch(conversation._id, {
					unreadCount: conversation.unreadCount + 1,
					...(shouldAdvanceConversation
						? {
								lastMessageAt: timestamp,
								lastMessagePreview: preview.slice(0, 100),
								windowExpiresAt,
							}
						: {}),
				});

				await ctx.runMutation(internal.forwarding.enqueueEvent, {
					accountId: args.accountId,
					eventType: "message.inbound.received",
					source: "meta_webhook",
					occurredAt: timestamp,
					dedupeKey: msg.id,
					payload: {
						messageId,
						waMessageId: msg.id,
						conversationId: conversation._id,
						contactId: contact._id,
						from: msg.from,
						type: messageType,
						text: msg.text?.body,
						caption: (media as { caption?: string })?.caption,
						timestamp,
						raw: msg,
					},
				});

				// Schedule media download if present
				if (mediaMetaId) {
					const accessToken = await getOwnerAccessToken(ctx, account.ownerId);
					await ctx.scheduler.runAfter(
						0,
						internal.webhook.downloadAndStoreMedia,
						{
							metaMediaId: mediaMetaId,
							accessToken,
							messageId,
						},
					);
				}
			}

			await ctx.db.patch(args.logId, {
				processed: true,
				processedAt: Date.now(),
			});
		} catch (error) {
			await ctx.db.patch(args.logId, {
				processed: true,
				processedAt: Date.now(),
				error: error instanceof Error ? error.message : "Unknown error",
			});
			throw error; // Re-throw so Convex retries
		}
	},
});

// Update message with media storage ID
export const updateMessageMedia = internalMutation({
	args: {
		messageId: v.id("messages"),
		mediaId: v.id("_storage"),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.messageId, {
			mediaId: args.mediaId,
		});
	},
});

// ============================================================================
// INTERNAL ACTIONS (for external API calls)
// ============================================================================

/**
 * Download media from Meta and store in Convex.
 * Called by scheduler after message is stored.
 */
export const downloadAndStoreMedia = internalAction({
	args: {
		metaMediaId: v.string(),
		accessToken: v.string(),
		messageId: v.id("messages"),
	},
	handler: async (ctx, args): Promise<Id<"_storage"> | null> => {
		try {
			// First get the media URL from Meta (JSON endpoint → use metaFetch)
			const mediaInfo = await metaFetch<{
				url: string;
				mime_type: string;
				file_size: number;
			}>(args.metaMediaId, args.accessToken, { tokenInBody: false });

			// Download the actual media (binary — intentionally NOT using metaFetch)
			// URL expires in 5 minutes
			const mediaResponse = await fetch(mediaInfo.url, {
				headers: {
					Authorization: `Bearer ${args.accessToken}`,
				},
			});

			if (!mediaResponse.ok) {
				console.error("Failed to download media:", mediaResponse.status);
				return null;
			}

			const blob = await mediaResponse.blob();
			const storageId = await ctx.storage.store(blob);

			// Update the message with the storage ID
			await ctx.runMutation(internal.webhook.updateMessageMedia, {
				messageId: args.messageId,
				mediaId: storageId,
			});

			return storageId;
		} catch (error) {
			console.error("Error downloading media:", error);
			return null;
		}
	},
});
