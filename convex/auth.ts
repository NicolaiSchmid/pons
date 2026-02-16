import Facebook from "@auth/core/providers/facebook";
import { convexAuth } from "@convex-dev/auth/server";
import type { GenericId } from "convex/values";
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
			// Capture the Facebook access token from the OAuth response.
			// IMPORTANT: Only return fields that exist on the `users` table.
			// Custom fields (facebookAccessToken, facebookTokenExpiresAt) are
			// NOT safe here — the library spreads the entire profile onto the
			// user document, causing a schema validation error that silently
			// aborts the sign-in flow.
			profile(facebookProfile, tokens) {
				return {
					id: facebookProfile.id as string,
					name: facebookProfile.name as string,
					email: facebookProfile.email as string,
					image: facebookProfile.picture?.data?.url as string | undefined,
					// Stash token data on the profile so createOrUpdateUser can grab
					// it and store it in a separate table — these keys are stripped
					// before the user doc is written.
					facebookAccessToken: tokens.access_token as string | undefined,
					facebookTokenExpiresAt: tokens.expires_at
						? (tokens.expires_at as number) * 1000 // Convert to ms
						: undefined,
				};
			},
		}),
	],
	callbacks: {
		// Use createOrUpdateUser to intercept the profile BEFORE it hits the
		// users table. We strip non-schema fields, write the user doc ourselves,
		// and store the Facebook token in a separate table.
		async createOrUpdateUser(ctx: MutationCtx, { existingUserId, profile }) {
			// Extract and remove custom fields that don't belong on the users table
			const {
				facebookAccessToken,
				facebookTokenExpiresAt,
				id: _id, // provider id, not needed on user doc
				emailVerified: _emailVerified,
				...userFields
			} = profile as Record<string, unknown> & {
				facebookAccessToken?: string;
				facebookTokenExpiresAt?: number;
				id?: string;
				emailVerified?: boolean;
			};

			// Only keep fields the users table actually has
			const userData: Record<string, unknown> = {};
			for (const key of [
				"name",
				"image",
				"email",
				"phone",
				"isAnonymous",
			] as const) {
				if (userFields[key] !== undefined) {
					userData[key] = userFields[key];
				}
			}

			let userId: GenericId<"users">;
			if (existingUserId) {
				await ctx.db.patch(existingUserId, userData);
				userId = existingUserId;
			} else {
				userId = await ctx.db.insert("users", userData);
			}

			// Store the Facebook token in a separate table
			if (facebookAccessToken) {
				const existing = await ctx.db
					.query("facebookTokens")
					.withIndex("by_user", (q) => q.eq("userId", userId))
					.first();

				if (existing) {
					await ctx.db.patch(existing._id, {
						accessToken: facebookAccessToken,
						expiresAt: facebookTokenExpiresAt,
					});
				} else {
					await ctx.db.insert("facebookTokens", {
						userId,
						accessToken: facebookAccessToken,
						expiresAt: facebookTokenExpiresAt,
					});
				}
			}

			return userId;
		},
	},
});
