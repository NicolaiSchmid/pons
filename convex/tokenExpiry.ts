/**
 * Token expiry monitoring — sends escalating email warnings before
 * Facebook OAuth tokens expire.
 *
 * Runs every 5 minutes via cron. For each user with a facebookToken
 * that has an expiresAt, it checks which warning tier the user has
 * entered and sends the appropriate email if not already sent.
 *
 * Warning tiers (time before expiry):
 *   14d → 7d → 5d → 3d → 2d → 1d → 12h → 6h → 4h → 1h → 30m → 15m → 5m
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";

// Tiers ordered from earliest to latest warning.
// The cron picks the most urgent tier the user has entered.
const TIERS = [
	{ id: "14d", ms: 14 * 24 * 60 * 60 * 1000, label: "14 days" },
	{ id: "7d", ms: 7 * 24 * 60 * 60 * 1000, label: "7 days" },
	{ id: "5d", ms: 5 * 24 * 60 * 60 * 1000, label: "5 days" },
	{ id: "3d", ms: 3 * 24 * 60 * 60 * 1000, label: "3 days" },
	{ id: "2d", ms: 2 * 24 * 60 * 60 * 1000, label: "2 days" },
	{ id: "1d", ms: 1 * 24 * 60 * 60 * 1000, label: "1 day" },
	{ id: "12h", ms: 12 * 60 * 60 * 1000, label: "12 hours" },
	{ id: "6h", ms: 6 * 60 * 60 * 1000, label: "6 hours" },
	{ id: "4h", ms: 4 * 60 * 60 * 1000, label: "4 hours" },
	{ id: "1h", ms: 1 * 60 * 60 * 1000, label: "1 hour" },
	{ id: "30m", ms: 30 * 60 * 1000, label: "30 minutes" },
	{ id: "15m", ms: 15 * 60 * 1000, label: "15 minutes" },
	{ id: "5m", ms: 5 * 60 * 1000, label: "5 minutes" },
] as const;

type TierId = (typeof TIERS)[number]["id"];
const TIER_IDS: TierId[] = TIERS.map((t) => t.id);

/**
 * Find the current tier for a given time-left-until-expiry.
 * Returns the most urgent tier the user has entered, or null if
 * the token is still more than 14 days out.
 */
function getCurrentTier(timeLeftMs: number) {
	// Walk from most urgent (5m) to least (14d).
	// The first tier whose ms is >= timeLeftMs is the current one.
	for (let i = TIERS.length - 1; i >= 0; i--) {
		const tier = TIERS[i];
		if (tier && timeLeftMs <= tier.ms) {
			return tier;
		}
	}
	return null;
}

/**
 * Check whether a tier is more urgent than the last sent tier.
 */
function isMoreUrgent(
	currentTierId: TierId,
	lastSentTierId: string | undefined,
): boolean {
	if (!lastSentTierId) return true;
	const currentIdx = TIER_IDS.indexOf(currentTierId);
	const lastIdx = TIER_IDS.indexOf(lastSentTierId as TierId);
	// Higher index = more urgent
	return currentIdx > lastIdx;
}

/**
 * Cron entry point — scans all facebook tokens and sends warnings.
 */
export const checkExpiringTokens = internalAction({
	args: {},
	handler: async (ctx) => {
		const tokens = await ctx.runQuery(
			internal.tokenExpiry.listTokensWithExpiry,
		);

		const now = Date.now();

		for (const token of tokens) {
			if (!token.expiresAt) continue;

			const timeLeft = token.expiresAt - now;
			if (timeLeft <= 0) continue; // Already expired, nothing to warn about

			const tier = getCurrentTier(timeLeft);
			if (!tier) continue; // More than 14 days out

			// Skip if we already sent this tier (or a more urgent one)
			if (!isMoreUrgent(tier.id, token.lastExpiryEmailTier ?? undefined))
				continue;

			// Get user email
			const user = await ctx.runQuery(internal.tokenExpiry.getUser, {
				userId: token.userId,
			});
			if (!user?.email) continue;

			const reAuthUrl = "https://pons.chat";

			// Send the warning email
			await ctx.runAction(internal.email.sendTokenExpiryWarning, {
				to: user.email,
				userName: user.name ?? "there",
				timeLeft: tier.label,
				reAuthUrl,
			});

			// Mark this tier as sent
			await ctx.runMutation(internal.tokenExpiry.markTierSent, {
				tokenId: token._id,
				tierId: tier.id,
			});
		}
	},
});

// ── Internal helpers (queries/mutations used by the action) ──

export const listTokensWithExpiry = internalQuery({
	args: {},
	handler: async (ctx) => {
		// Get all tokens that have an expiresAt
		const tokens = await ctx.db.query("facebookTokens").collect();
		return tokens.filter((t) => t.expiresAt != null);
	},
});

export const getUser = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.userId);
	},
});

export const markTierSent = internalMutation({
	args: {
		tokenId: v.id("facebookTokens"),
		tierId: v.string(),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.tokenId, {
			lastExpiryEmailTier: args.tierId,
		});
	},
});
