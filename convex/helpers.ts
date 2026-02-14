import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Check if a user has access to an account via membership
 */
export async function checkAccountAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  accountId: Id<"accounts">
): Promise<boolean> {
  const membership = await ctx.db
    .query("accountMembers")
    .withIndex("by_account_user", (q) =>
      q.eq("accountId", accountId).eq("userId", userId)
    )
    .first();
  return !!membership;
}
