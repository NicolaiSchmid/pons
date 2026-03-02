/**
 * Name review polling workflow — checks Meta's API for display name approval.
 *
 * Meta has no webhook for name approval, so we poll hourly.
 * After registration, the display name goes to Meta review (typically 1-3 days).
 *
 * This is implemented as a durable polling loop using ctx.scheduler.runAfter:
 * 1. checkNameStatus runs, queries Meta API for name_status
 * 2. If approved → transition to active
 * 3. If declined → transition to name_declined
 * 4. If still pending and under max checks → schedule next check in 1 hour
 * 5. If max checks exceeded → stop polling (user can re-trigger manually)
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import { auth } from "./auth";
import { metaFetch } from "./metaFetch";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check the name_status of a phone number via Meta API.
 * Scheduled by phoneRegistration after successful registration,
 * and re-schedules itself until resolved or max checks exceeded.
 */
export const checkNameStatus = internalAction({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) return;

		// Only poll for accounts in states tied to name review lifecycle
		if (
			account.status !== "pending_name_review" &&
			account.status !== "name_declined"
		)
			return;

		if (!account.phoneNumberId) {
			console.error(
				`Name review: account ${args.accountId} has no phoneNumberId`,
			);
			return;
		}

		// Check if we've exceeded max checks
		const checkCount = (account.nameReviewCheckCount ?? 0) + 1;
		const maxChecks = account.nameReviewMaxChecks ?? 120;

		if (checkCount > maxChecks) {
			// Stop polling — user can re-trigger manually
			await ctx.runMutation(internal.accounts.updateNameReviewProgress, {
				accountId: args.accountId,
				lastCheckedAt: Date.now(),
				checkCount,
				scheduledJobId: undefined,
			});
			return;
		}

		// Get access token
		const fbToken = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId: account.ownerId },
		);

		const token = fbToken;
		if (!token) {
			console.error(
				`Name review: no access token for account ${args.accountId}`,
			);
			return;
		}

		try {
			// Query Meta API for phone number details including name_status
			const data = await metaFetch<{
				name_status?: string;
				verified_name?: string;
			}>(`${account.phoneNumberId}?fields=name_status,verified_name`, token, {
				tokenInBody: false,
			});

			const nameStatus = data.name_status?.toLowerCase();

			if (nameStatus === "approved") {
				await ctx.runMutation(internal.accounts.transitionToActive, {
					accountId: args.accountId,
				});
				// TODO: Send email notification to user
				return;
			}

			if (nameStatus === "declined" || nameStatus === "rejected") {
				if (account.status !== "name_declined") {
					await ctx.runMutation(internal.accounts.transitionToNameDeclined, {
						accountId: args.accountId,
					});
				}
				// TODO: Send email notification to user
				return;
			}

			if (account.status === "name_declined") {
				await ctx.runMutation(internal.accounts.transitionToPendingNameReview, {
					accountId: args.accountId,
				});
			}

			// Still pending — schedule next check
			const jobId = await ctx.scheduler.runAfter(
				POLL_INTERVAL_MS,
				internal.nameReview.checkNameStatus,
				{ accountId: args.accountId },
			);

			await ctx.runMutation(internal.accounts.updateNameReviewProgress, {
				accountId: args.accountId,
				lastCheckedAt: Date.now(),
				checkCount,
				scheduledJobId: jobId.toString(),
			});
		} catch (error) {
			console.error(
				`Name review: error checking status for account ${args.accountId}:`,
				error,
			);

			// Schedule retry on error
			const jobId = await ctx.scheduler.runAfter(
				POLL_INTERVAL_MS,
				internal.nameReview.checkNameStatus,
				{ accountId: args.accountId },
			);
			await ctx.runMutation(internal.accounts.updateNameReviewProgress, {
				accountId: args.accountId,
				lastCheckedAt: Date.now(),
				checkCount,
				scheduledJobId: jobId.toString(),
			});
		}
	},
});

/**
 * Manually re-trigger name review polling (e.g., user clicks "Check again").
 * Useful if max checks were exceeded or user wants an immediate check.
 */
export const retriggerNameReview = internalAction({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");
		if (account.status !== "pending_name_review") {
			throw new Error("Account is not in pending_name_review status");
		}

		// Reset check count and re-run immediately
		await ctx.runMutation(internal.accounts.updateNameReviewProgress, {
			accountId: args.accountId,
			lastCheckedAt: Date.now(),
			checkCount: 0,
		});

		// Run immediately
		await ctx.scheduler.runAfter(0, internal.nameReview.checkNameStatus, {
			accountId: args.accountId,
		});
	},
});

/**
 * User-triggered immediate name status check.
 * Useful after re-submitting a display name in Meta Business Suite.
 */
export const recheckNameStatus = action({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (
			account.status !== "pending_name_review" &&
			account.status !== "name_declined"
		) {
			throw new Error(
				`Cannot re-check name status in status: ${account.status}`,
			);
		}

		await ctx.runAction(internal.nameReview.checkNameStatus, {
			accountId: args.accountId,
		});

		return { success: true };
	},
});
