import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalQuery,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { auth } from "./auth";
import { webhookForwardEventType } from "./schema";

const DEFAULT_EVENTS: Array<
	| "message.inbound.received"
	| "message.outbound.sent"
	| "message.outbound.failed"
	| "message.status.updated"
> = [
	"message.inbound.received",
	"message.outbound.sent",
	"message.outbound.failed",
	"message.status.updated",
];

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_TIMEOUT_MS = 10_000;

function generateSigningSecret(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

async function requireAccountMember(
	ctx: QueryCtx | MutationCtx,
	accountId: Id<"accounts">,
	userId: Id<"users">,
) {
	const membership = await ctx.db
		.query("accountMembers")
		.withIndex("by_account_user", (q) =>
			q.eq("accountId", accountId).eq("userId", userId),
		)
		.first();

	if (!membership) {
		throw new Error("Unauthorized");
	}

	return membership;
}

export const listByAccount = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		await requireAccountMember(ctx, args.accountId, userId);

		const targets = await ctx.db
			.query("webhookTargets")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();

		return targets.map((target) => ({
			_id: target._id,
			_creationTime: target._creationTime,
			accountId: target.accountId,
			name: target.name,
			url: target.url,
			enabled: target.enabled,
			subscribedEvents: target.subscribedEvents,
			maxAttempts: target.maxAttempts,
			timeoutMs: target.timeoutMs,
			lastDeliveryAt: target.lastDeliveryAt,
			lastSuccessAt: target.lastSuccessAt,
			lastFailureAt: target.lastFailureAt,
			consecutiveFailures: target.consecutiveFailures,
			lastError: target.lastError,
			signingSecretPreview: `••••••${target.signingSecret.slice(-6)}`,
			updatedAt: target.updatedAt,
		}));
	},
});

export const create = mutation({
	args: {
		accountId: v.id("accounts"),
		name: v.string(),
		url: v.string(),
		enabled: v.optional(v.boolean()),
		subscribedEvents: v.optional(v.array(webhookForwardEventType)),
		maxAttempts: v.optional(v.number()),
		timeoutMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await requireAccountMember(ctx, args.accountId, userId);
		if (membership.role === "member") {
			throw new Error("Only admins and owners can manage webhook targets");
		}

		if (
			!args.url.startsWith("https://") &&
			!args.url.startsWith("http://localhost")
		) {
			throw new Error(
				"Webhook URL must use HTTPS (localhost is allowed for development)",
			);
		}

		const maxAttempts = args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		if (maxAttempts < 1 || maxAttempts > 20) {
			throw new Error("maxAttempts must be between 1 and 20");
		}
		if (timeoutMs < 1000 || timeoutMs > 60000) {
			throw new Error("timeoutMs must be between 1000 and 60000");
		}

		const signingSecret = generateSigningSecret();

		const now = Date.now();
		const targetId = await ctx.db.insert("webhookTargets", {
			accountId: args.accountId,
			name: args.name.trim(),
			url: args.url.trim(),
			enabled: args.enabled ?? true,
			subscribedEvents: args.subscribedEvents ?? DEFAULT_EVENTS,
			signingSecret,
			maxAttempts,
			timeoutMs,
			consecutiveFailures: 0,
			createdBy: userId,
			updatedAt: now,
		});

		return { targetId, signingSecret };
	},
});

export const update = mutation({
	args: {
		targetId: v.id("webhookTargets"),
		name: v.optional(v.string()),
		url: v.optional(v.string()),
		enabled: v.optional(v.boolean()),
		subscribedEvents: v.optional(v.array(webhookForwardEventType)),
		maxAttempts: v.optional(v.number()),
		timeoutMs: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const target = await ctx.db.get(args.targetId);
		if (!target) throw new Error("Webhook target not found");

		const membership = await requireAccountMember(
			ctx,
			target.accountId,
			userId,
		);
		if (membership.role === "member") {
			throw new Error("Only admins and owners can manage webhook targets");
		}

		if (
			args.url &&
			!args.url.startsWith("https://") &&
			!args.url.startsWith("http://localhost")
		) {
			throw new Error(
				"Webhook URL must use HTTPS (localhost is allowed for development)",
			);
		}

		if (
			args.maxAttempts !== undefined &&
			(args.maxAttempts < 1 || args.maxAttempts > 20)
		) {
			throw new Error("maxAttempts must be between 1 and 20");
		}
		if (
			args.timeoutMs !== undefined &&
			(args.timeoutMs < 1000 || args.timeoutMs > 60000)
		) {
			throw new Error("timeoutMs must be between 1000 and 60000");
		}

		await ctx.db.patch(args.targetId, {
			name: args.name?.trim(),
			url: args.url?.trim(),
			enabled: args.enabled,
			subscribedEvents: args.subscribedEvents,
			maxAttempts: args.maxAttempts,
			timeoutMs: args.timeoutMs,
			updatedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: { targetId: v.id("webhookTargets") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const target = await ctx.db.get(args.targetId);
		if (!target) return;

		const membership = await requireAccountMember(
			ctx,
			target.accountId,
			userId,
		);
		if (membership.role === "member") {
			throw new Error("Only admins and owners can manage webhook targets");
		}

		await ctx.db.delete(args.targetId);
	},
});

export const rotateSecret = mutation({
	args: { targetId: v.id("webhookTargets") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const target = await ctx.db.get(args.targetId);
		if (!target) throw new Error("Webhook target not found");

		const membership = await requireAccountMember(
			ctx,
			target.accountId,
			userId,
		);
		if (membership.role === "member") {
			throw new Error("Only admins and owners can manage webhook targets");
		}

		const signingSecret = generateSigningSecret();

		await ctx.db.patch(args.targetId, {
			signingSecret,
			updatedAt: Date.now(),
		});

		return { signingSecret };
	},
});

export const getTargetInternal = internalQuery({
	args: { targetId: v.id("webhookTargets") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.targetId);
	},
});
