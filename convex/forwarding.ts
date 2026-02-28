import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";
import { webhookForwardEventType, webhookForwardSource } from "./schema";

const MAX_RESPONSE_SNIPPET_LENGTH = 1000;

function truncate(value: string): string {
	if (value.length <= MAX_RESPONSE_SNIPPET_LENGTH) return value;
	return `${value.slice(0, MAX_RESPONSE_SNIPPET_LENGTH)}...`;
}

function retryDelayMs(attempt: number): number {
	const base = 5000;
	const cap = 60 * 60 * 1000;
	const backoff = Math.min(cap, base * 2 ** Math.max(0, attempt - 1));
	const jitter = Math.floor(Math.random() * 1000);
	return backoff + jitter;
}

export const enqueueEvent = internalMutation({
	args: {
		accountId: v.id("accounts"),
		eventType: webhookForwardEventType,
		source: webhookForwardSource,
		occurredAt: v.optional(v.number()),
		payload: v.any(),
		dedupeKey: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.dedupeKey) {
			const existing = await ctx.db
				.query("webhookEvents")
				.withIndex("by_account_dedupe", (q) =>
					q.eq("accountId", args.accountId).eq("dedupeKey", args.dedupeKey),
				)
				.first();
			if (existing) {
				return { eventId: existing._id, deliveries: 0, deduped: true };
			}
		}

		const eventId = await ctx.db.insert("webhookEvents", {
			accountId: args.accountId,
			eventType: args.eventType,
			source: args.source,
			occurredAt: args.occurredAt ?? Date.now(),
			payload: args.payload,
			dedupeKey: args.dedupeKey,
		});

		await ctx.scheduler.runAfter(0, internal.forwarding.prepareDeliveries, {
			eventId,
		});

		return { eventId, deliveries: 0, deduped: false, queued: true };
	},
});

export const prepareDeliveries = internalMutation({
	args: {
		eventId: v.id("webhookEvents"),
	},
	handler: async (ctx, args) => {
		const event = await ctx.db.get(args.eventId);
		if (!event) {
			return { deliveries: 0 };
		}

		const targets = await ctx.db
			.query("webhookTargets")
			.withIndex("by_account_enabled", (q) =>
				q.eq("accountId", event.accountId).eq("enabled", true),
			)
			.collect();

		let deliveries = 0;
		for (const target of targets) {
			if (!target.subscribedEvents.includes(event.eventType)) continue;

			deliveries += 1;
			const deliveryId = await ctx.db.insert("webhookDeliveries", {
				accountId: event.accountId,
				eventId: event._id,
				targetId: target._id,
				status: "pending",
				attemptCount: 0,
				maxAttempts: target.maxAttempts,
				nextAttemptAt: Date.now(),
			});

			await ctx.scheduler.runAfter(0, internal.forwarding.dispatchDelivery, {
				deliveryId,
			});
		}

		return { deliveries };
	},
});

export const getDeliveryContext = internalQuery({
	args: {
		deliveryId: v.id("webhookDeliveries"),
	},
	handler: async (ctx, args) => {
		const delivery = await ctx.db.get(args.deliveryId);
		if (!delivery) return null;

		const [target, event] = await Promise.all([
			ctx.db.get(delivery.targetId),
			ctx.db.get(delivery.eventId),
		]);

		if (!target || !event) return null;

		return { delivery, target, event };
	},
});

export const markDeliverySuccess = internalMutation({
	args: {
		deliveryId: v.id("webhookDeliveries"),
		attemptCount: v.number(),
		statusCode: v.number(),
		responseSnippet: v.optional(v.string()),
		deliveredAt: v.number(),
	},
	handler: async (ctx, args) => {
		const delivery = await ctx.db.get(args.deliveryId);
		if (!delivery) return;

		await ctx.db.patch(args.deliveryId, {
			status: "succeeded",
			attemptCount: args.attemptCount,
			lastAttemptAt: args.deliveredAt,
			nextAttemptAt: undefined,
			lastStatusCode: args.statusCode,
			lastResponseSnippet: args.responseSnippet,
			lastError: undefined,
			deliveredAt: args.deliveredAt,
		});

		const target = await ctx.db.get(delivery.targetId);
		if (!target) return;

		await ctx.db.patch(target._id, {
			lastDeliveryAt: args.deliveredAt,
			lastSuccessAt: args.deliveredAt,
			consecutiveFailures: 0,
			lastError: undefined,
			updatedAt: Date.now(),
		});
	},
});

export const markDeliveryFailure = internalMutation({
	args: {
		deliveryId: v.id("webhookDeliveries"),
		attemptCount: v.number(),
		statusCode: v.optional(v.number()),
		error: v.string(),
		responseSnippet: v.optional(v.string()),
		retryAt: v.optional(v.number()),
		failedAt: v.number(),
	},
	handler: async (ctx, args) => {
		const delivery = await ctx.db.get(args.deliveryId);
		if (!delivery) return;

		await ctx.db.patch(args.deliveryId, {
			status: args.retryAt ? "pending" : "failed",
			attemptCount: args.attemptCount,
			lastAttemptAt: args.failedAt,
			nextAttemptAt: args.retryAt,
			lastStatusCode: args.statusCode,
			lastError: args.error,
			lastResponseSnippet: args.responseSnippet,
			deliveredAt: undefined,
		});

		const target = await ctx.db.get(delivery.targetId);
		if (!target) return;

		await ctx.db.patch(target._id, {
			lastDeliveryAt: args.failedAt,
			lastFailureAt: args.failedAt,
			consecutiveFailures: target.consecutiveFailures + 1,
			lastError: args.error,
			updatedAt: Date.now(),
		});
	},
});

export const dispatchDelivery = internalAction({
	args: {
		deliveryId: v.id("webhookDeliveries"),
	},
	handler: async (ctx, args) => {
		const context = await ctx.runQuery(internal.forwarding.getDeliveryContext, {
			deliveryId: args.deliveryId,
		});

		if (!context) return;

		const { delivery, event, target } = context;
		if (delivery.status === "succeeded" || delivery.status === "failed") return;

		if (!target.enabled) {
			await ctx.runMutation(internal.forwarding.markDeliveryFailure, {
				deliveryId: delivery._id,
				attemptCount: delivery.attemptCount,
				error: "Target disabled",
				failedAt: Date.now(),
			});
			return;
		}

		const attemptCount = delivery.attemptCount + 1;
		const envelope = {
			id: event._id,
			type: event.eventType,
			source: event.source,
			occurredAt: event.occurredAt,
			accountId: event.accountId,
			payload: event.payload,
		};
		const body = JSON.stringify(envelope);
		const timestamp = Date.now().toString();

		const signature = await ctx.runAction(internal.mcpNode.signWebhookPayload, {
			secret: target.signingSecret,
			payload: body,
			timestamp,
		});

		const timeoutMs = target.timeoutMs;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(target.url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"User-Agent": "pons-webhook-forwarder/1.0",
					"X-Pons-Event-Id": event._id,
					"X-Pons-Event-Type": event.eventType,
					"X-Pons-Delivery-Id": delivery._id,
					"X-Pons-Attempt": attemptCount.toString(),
					"X-Pons-Timestamp": timestamp,
					"X-Pons-Signature": signature,
				},
				body,
				signal: controller.signal,
			});

			const responseBody = truncate(await response.text());
			const now = Date.now();
			if (response.status === 200) {
				await ctx.runMutation(internal.forwarding.markDeliverySuccess, {
					deliveryId: delivery._id,
					attemptCount,
					statusCode: response.status,
					responseSnippet: responseBody,
					deliveredAt: now,
				});
				return;
			}

			const shouldRetry = attemptCount < delivery.maxAttempts;
			const retryAt = shouldRetry
				? now + retryDelayMs(attemptCount)
				: undefined;

			await ctx.runMutation(internal.forwarding.markDeliveryFailure, {
				deliveryId: delivery._id,
				attemptCount,
				statusCode: response.status,
				error: `Unexpected status ${response.status}`,
				responseSnippet: responseBody,
				retryAt,
				failedAt: now,
			});

			if (retryAt) {
				await ctx.scheduler.runAfter(
					Math.max(0, retryAt - now),
					internal.forwarding.dispatchDelivery,
					{ deliveryId: delivery._id },
				);
			}
		} catch (error) {
			const now = Date.now();
			const message =
				error instanceof Error ? error.message : "Unknown delivery error";
			const shouldRetry = attemptCount < delivery.maxAttempts;
			const retryAt = shouldRetry
				? now + retryDelayMs(attemptCount)
				: undefined;

			await ctx.runMutation(internal.forwarding.markDeliveryFailure, {
				deliveryId: delivery._id,
				attemptCount,
				error: truncate(message),
				retryAt,
				failedAt: now,
			});

			if (retryAt) {
				await ctx.scheduler.runAfter(
					Math.max(0, retryAt - now),
					internal.forwarding.dispatchDelivery,
					{ deliveryId: delivery._id },
				);
			}
		} finally {
			clearTimeout(timeout);
		}
	},
});

export const listRecentDeliveriesByTarget = internalQuery({
	args: {
		targetId: v.id("webhookTargets"),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const all = await ctx.db
			.query("webhookDeliveries")
			.withIndex("by_target", (q) => q.eq("targetId", args.targetId))
			.collect();

		const limit = args.limit ?? 20;
		const sorted = all
			.sort(
				(a, b) =>
					(b.lastAttemptAt ?? b._creationTime) -
					(a.lastAttemptAt ?? a._creationTime),
			)
			.slice(0, limit);

		const eventsById = new Map<
			Id<"webhookEvents">,
			{ eventType: string; occurredAt: number }
		>();
		for (const delivery of sorted) {
			if (eventsById.has(delivery.eventId)) continue;
			const event = await ctx.db.get(delivery.eventId);
			if (!event) continue;
			eventsById.set(delivery.eventId, {
				eventType: event.eventType,
				occurredAt: event.occurredAt,
			});
		}

		return sorted.map((delivery) => {
			const event = eventsById.get(delivery.eventId);
			return {
				_id: delivery._id,
				eventId: delivery.eventId,
				eventType: event?.eventType ?? "unknown",
				eventOccurredAt: event?.occurredAt,
				status: delivery.status,
				attemptCount: delivery.attemptCount,
				maxAttempts: delivery.maxAttempts,
				lastAttemptAt: delivery.lastAttemptAt,
				nextAttemptAt: delivery.nextAttemptAt,
				lastStatusCode: delivery.lastStatusCode,
				lastError: delivery.lastError,
			};
		});
	},
});
