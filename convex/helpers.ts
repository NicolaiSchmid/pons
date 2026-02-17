import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * Check if a user has access to an account via membership
 */
export async function checkAccountAccess(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
	accountId: Id<"accounts">,
): Promise<boolean> {
	const membership = await ctx.db
		.query("accountMembers")
		.withIndex("by_account_user", (q) =>
			q.eq("accountId", accountId).eq("userId", userId),
		)
		.first();
	return !!membership;
}

/**
 * Resolve the Facebook OAuth access token for an account's owner.
 * Used in mutations/queries that have direct DB access.
 */
export async function getOwnerAccessToken(
	ctx: QueryCtx | MutationCtx,
	ownerId: Id<"users">,
): Promise<string> {
	const token = await ctx.db
		.query("facebookTokens")
		.withIndex("by_user", (q) => q.eq("userId", ownerId))
		.first();
	if (!token?.accessToken) {
		throw new Error(
			"No Facebook access token found for account owner. The owner needs to re-authenticate.",
		);
	}
	return token.accessToken;
}
