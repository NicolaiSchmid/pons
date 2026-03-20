import { oauthProvider } from "@better-auth/oauth-provider";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import authConfig from "./auth.config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pons.chat";
const FACEBOOK_CONFIG_ID = "909601165285095";
const MCP_RESOURCE_URL = `${APP_URL}/api/mcp`;
const MCP_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"read",
	"write",
	"send",
	"messages:read",
	"messages:write",
	"conversations:read",
	"templates:read",
] as const;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth({
		baseURL: APP_URL,
		trustedOrigins: [APP_URL],
		database: authComponent.adapter(ctx),
		account: {
			accountLinking: {
				enabled: true,
			},
		},
		socialProviders: {
			facebook: {
				clientId: process.env.FACEBOOK_APP_ID ?? "",
				clientSecret: process.env.FACEBOOK_APP_SECRET ?? "",
				configId: FACEBOOK_CONFIG_ID,
			},
		},
		plugins: [
			convex({ authConfig }),
			jwt({
				disableSettingJwtHeader: true,
				jwt: {
					issuer: `${APP_URL}/api/auth`,
				},
			}),
			oauthProvider({
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				clientRegistrationAllowedScopes: [...MCP_SCOPES],
				clientRegistrationDefaultScopes: [
					"read",
					"write",
					"send",
					"offline_access",
				],
				consentPage: "/oauth/consent",
				grantTypes: ["authorization_code", "refresh_token"],
				loginPage: "/oauth/login",
				scopes: [...MCP_SCOPES],
				validAudiences: [MCP_RESOURCE_URL],
			}),
		],
	});

type AuthUser = Awaited<ReturnType<typeof authComponent.safeGetAuthUser>>;

function toAppUserPatch(authUser: NonNullable<AuthUser>) {
	return {
		betterAuthUserId: authUser._id,
		email: authUser.email ?? undefined,
		emailVerificationTime: authUser.emailVerified
			? authUser.updatedAt
			: undefined,
		image: authUser.image ?? undefined,
		name: authUser.name ?? undefined,
	};
}

async function findAppUserByAuthUser(
	ctx: QueryCtx | MutationCtx,
	authUser: NonNullable<AuthUser>,
) {
	if (authUser.userId) {
		const byLinkedId = await ctx.db.get(authUser.userId as Id<"users">);
		if (byLinkedId) {
			return byLinkedId;
		}
	}

	const byBetterAuthUserId = await ctx.db
		.query("users")
		.withIndex("by_better_auth_user", (q) =>
			q.eq("betterAuthUserId", authUser._id),
		)
		.first();
	if (byBetterAuthUserId) {
		return byBetterAuthUserId;
	}

	if (!authUser.email) {
		return null;
	}

	return await ctx.db
		.query("users")
		.withIndex("email", (q) => q.eq("email", authUser.email))
		.first();
}

async function syncAppUserLink(
	ctx: MutationCtx,
	authUser: NonNullable<AuthUser>,
	appUser: Doc<"users">,
) {
	const patch = toAppUserPatch(authUser);

	await ctx.db.patch(appUser._id, patch);
	if (authUser.userId !== appUser._id) {
		await authComponent.setUserId(ctx, authUser._id, appUser._id);
	}

	return appUser._id;
}

async function getFacebookAccountForAppUser(
	ctx: QueryCtx | MutationCtx,
	userId: Id<"users">,
) {
	const appUser = await ctx.db.get(userId);
	if (!appUser?.betterAuthUserId) {
		return null;
	}

	return await ctx.runQuery(components.betterAuth.adapter.findOne, {
		model: "account",
		where: [
			{ field: "userId", value: appUser.betterAuthUserId },
			{ field: "providerId", value: "facebook", connector: "AND" },
		],
	});
}

export const auth = {
	async getUserId(ctx: GenericCtx<DataModel>): Promise<Id<"users"> | null> {
		if (!("db" in ctx)) {
			return await ctx.runQuery(internal.auth.resolveCurrentUserId, {});
		}

		const authUser = await authComponent.safeGetAuthUser(ctx);
		if (!authUser) {
			return null;
		}

		if (authUser.userId) {
			return authUser.userId as Id<"users">;
		}

		const appUser = await findAppUserByAuthUser(ctx, authUser);
		return appUser?._id ?? null;
	},
};

export const resolveCurrentUserId = internalQuery({
	args: {},
	handler: async (ctx) => {
		const authUser = await authComponent.safeGetAuthUser(ctx);
		if (!authUser) {
			return null;
		}

		if (authUser.userId) {
			return authUser.userId as Id<"users">;
		}

		const appUser = await findAppUserByAuthUser(ctx, authUser);
		return appUser?._id ?? null;
	},
});

export const resolveAppUserIdByBetterAuthUser = internalQuery({
	args: { betterAuthUserId: v.string() },
	handler: async (ctx, { betterAuthUserId }) => {
		const appUser = await ctx.db
			.query("users")
			.withIndex("by_better_auth_user", (q) =>
				q.eq("betterAuthUserId", betterAuthUserId),
			)
			.first();
		return appUser?._id ?? null;
	},
});

export const ensureCurrentUser = mutation({
	args: {},
	handler: async (ctx) => {
		const authUser = await authComponent.getAuthUser(ctx);
		const existing = await findAppUserByAuthUser(ctx, authUser);
		if (existing) {
			return await syncAppUserLink(ctx, authUser, existing);
		}

		const appUserId = await ctx.db.insert("users", toAppUserPatch(authUser));
		await authComponent.setUserId(ctx, authUser._id, appUserId);
		return appUserId;
	},
});

export const getCurrentUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		return await ctx.db.get(userId);
	},
});

export const getFacebookAccount = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const account = await getFacebookAccountForAppUser(ctx, userId);
		if (!account?.accessToken) {
			return null;
		}

		return {
			accessToken: account.accessToken,
			expiresAt: account.accessTokenExpiresAt ?? undefined,
		};
	},
});

export const listFacebookAccountsWithExpiry = internalQuery({
	args: {},
	handler: async (ctx) => {
		const accountsResult = await ctx.runQuery(
			components.betterAuth.adapter.findMany,
			{
				model: "account",
				where: [
					{ field: "providerId", value: "facebook" },
					{
						field: "accessTokenExpiresAt",
						operator: "ne",
						value: null,
						connector: "AND",
					},
				],
				paginationOpts: {
					numItems: 500,
					cursor: null,
				},
			},
		);
		const accounts = accountsResult.page;

		const results = await Promise.all(
			accounts.map(async (account: Record<string, unknown>) => {
				const user = await ctx.db
					.query("users")
					.withIndex("by_better_auth_user", (q) =>
						q.eq("betterAuthUserId", account.userId as string),
					)
					.first();
				const accessToken =
					typeof account.accessToken === "string" ? account.accessToken : null;
				const accessTokenExpiresAt =
					typeof account.accessTokenExpiresAt === "number"
						? account.accessTokenExpiresAt
						: null;
				if (!user || !accessToken || !accessTokenExpiresAt) {
					return null;
				}

				const lastExpiryEmailTier =
					user.facebookTokenWarningExpiresAt === accessTokenExpiresAt
						? user.facebookTokenWarningTier
						: undefined;

				return {
					userId: user._id,
					accessToken,
					expiresAt: accessTokenExpiresAt,
					lastExpiryEmailTier,
				};
			}),
		);

		return results.filter((result) => result !== null);
	},
});
