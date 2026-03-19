import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { api, components } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pons.chat";
const FACEBOOK_CONFIG_ID = "909601165285095";

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
				scopes: [
					"email",
					"public_profile",
					"business_management",
					"whatsapp_business_management",
					"whatsapp_business_messaging",
				],
				authorizationUrlParams: {
					config_id: FACEBOOK_CONFIG_ID,
				},
			},
		},
		plugins: [convex({ authConfig })],
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

export const auth = {
	async getUserId(ctx: GenericCtx<DataModel>): Promise<Id<"users"> | null> {
		if (!("db" in ctx)) {
			return await ctx.runQuery(api.auth.resolveCurrentUserId, {});
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

export const resolveCurrentUserId = query({
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
