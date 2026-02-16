import Facebook from "@auth/core/providers/facebook";
import { convexAuth } from "@convex-dev/auth/server";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Facebook({
			authorization: {
				params: {
					scope: [
						"email",
						"public_profile",
						"business_management",
						"whatsapp_business_management",
						"whatsapp_business_messaging",
					].join(","),
					config_id: "1198829922325154",
				},
			},
			// Capture the Facebook access token from the OAuth response
			profile(facebookProfile, tokens) {
				return {
					id: facebookProfile.id as string,
					name: facebookProfile.name as string,
					email: facebookProfile.email as string,
					image: facebookProfile.picture?.data?.url as string | undefined,
					// Pass the access token through the profile so we can store it
					facebookAccessToken: tokens.access_token as string | undefined,
					facebookTokenExpiresAt: tokens.expires_at
						? (tokens.expires_at as number) * 1000 // Convert to ms
						: undefined,
				};
			},
		}),
	],
	callbacks: {
		async afterUserCreatedOrUpdated(ctx: MutationCtx, { userId, profile }) {
			const fbToken = (profile as Record<string, unknown>)
				.facebookAccessToken as string | undefined;
			const fbExpiresAt = (profile as Record<string, unknown>)
				.facebookTokenExpiresAt as number | undefined;

			if (fbToken) {
				// Upsert the Facebook token for this user
				const existing = await ctx.db
					.query("facebookTokens")
					.withIndex("by_user", (q) => q.eq("userId", userId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, {
						accessToken: fbToken,
						expiresAt: fbExpiresAt,
					});
				} else {
					await ctx.db.insert("facebookTokens", {
						userId,
						accessToken: fbToken,
						expiresAt: fbExpiresAt,
					});
				}
			}
		},
	},
});
