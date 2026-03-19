import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	type ActionCtx,
	internalAction,
	internalMutation,
	internalQuery,
} from "./_generated/server";

type LegacyUserBackfillRow = {
	user: Doc<"users">;
	facebookAccount: Doc<"authAccounts"> | null;
	facebookToken: Doc<"facebookTokens"> | null;
};

type BetterAuthUserDoc = {
	_id: string;
	userId?: string | null;
	email?: string;
};

type BetterAuthAccountDoc = {
	_id: string;
	accountId?: string;
	providerId?: string;
	userId?: string;
	accessToken?: string | null;
	accessTokenExpiresAt?: number | null;
};

type BetterAuthBackfillPreview = {
	totalUsers: number;
	missingBetterAuthLink: number;
	missingEmail: Id<"users">[];
	withFacebookAccount: number;
	withFacebookToken: number;
	rows: Array<{
		userId: Id<"users">;
		email: string | null;
		name: string | null;
		hasFacebookAccount: boolean;
		hasFacebookToken: boolean;
	}>;
};

type BetterAuthBackfillResult = {
	processed: number;
	results: Array<{
		userId: Id<"users">;
		email: string | null;
		userStatus: string;
		accountStatus: string;
		betterAuthUserId?: string;
	}>;
};

export const previewBetterAuthBackfill = internalQuery({
	args: {},
	handler: async (ctx): Promise<BetterAuthBackfillPreview> => {
		const users = await ctx.db.query("users").collect();
		const rows = await Promise.all(
			users.map(async (user) => {
				const facebookAccount = await ctx.db
					.query("authAccounts")
					.withIndex("userIdAndProvider", (q) =>
						q.eq("userId", user._id).eq("provider", "facebook"),
					)
					.first();
				const facebookToken = await ctx.db
					.query("facebookTokens")
					.withIndex("by_user", (q) => q.eq("userId", user._id))
					.first();

				return {
					user,
					facebookAccount,
					facebookToken,
				} satisfies LegacyUserBackfillRow;
			}),
		);

		const missingLinkRows = rows.filter((row) => !row.user.betterAuthUserId);
		return {
			totalUsers: rows.length,
			missingBetterAuthLink: missingLinkRows.length,
			missingEmail: missingLinkRows
				.filter((row) => !row.user.email)
				.map((row) => row.user._id),
			withFacebookAccount: missingLinkRows.filter((row) => row.facebookAccount)
				.length,
			withFacebookToken: missingLinkRows.filter((row) => row.facebookToken)
				.length,
			rows: missingLinkRows.map((row) => ({
				userId: row.user._id,
				email: row.user.email ?? null,
				name: row.user.name ?? null,
				hasFacebookAccount: row.facebookAccount !== null,
				hasFacebookToken: row.facebookToken !== null,
			})),
		};
	},
});

export const listLegacyUsers = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("users").collect();
	},
});

export const patchUserBetterAuthLink = internalMutation({
	args: {
		userId: v.id("users"),
		betterAuthUserId: v.string(),
	},
	handler: async (ctx, { userId, betterAuthUserId }) => {
		await ctx.db.patch(userId, { betterAuthUserId });
	},
});

function buildBetterAuthUserData(user: Doc<"users">) {
	return {
		name: user.name ?? user.email ?? "Pons User",
		email: user.email ?? "",
		emailVerified: Boolean(user.emailVerificationTime),
		image: user.image ?? null,
		createdAt: Math.trunc(user._creationTime),
		updatedAt: Date.now(),
		twoFactorEnabled: null,
		isAnonymous: user.isAnonymous ?? null,
		username: null,
		displayUsername: null,
		phoneNumber: null,
		phoneNumberVerified: null,
		userId: user._id,
	};
}

function buildBetterAuthAccountData(
	row: LegacyUserBackfillRow,
	betterAuthUserId: string,
) {
	if (!row.facebookAccount) {
		return null;
	}

	return {
		accountId: row.facebookAccount.providerAccountId,
		providerId: row.facebookAccount.provider,
		userId: betterAuthUserId,
		accessToken: row.facebookToken?.accessToken ?? null,
		refreshToken: null,
		idToken: null,
		accessTokenExpiresAt: row.facebookToken?.expiresAt ?? null,
		refreshTokenExpiresAt: null,
		scope: null,
		password: null,
		createdAt: Math.trunc(row.facebookAccount._creationTime),
		updatedAt: Date.now(),
	};
}

async function findOrCreateBetterAuthUser(
	ctx: ActionCtx,
	row: LegacyUserBackfillRow,
) {
	if (!row.user.email) {
		return {
			status: "skipped_missing_email" as const,
		};
	}

	const existingByLinkedUser = (await ctx.runQuery(
		components.betterAuth.adapter.findOne,
		{
			model: "user",
			where: [{ field: "userId", value: row.user._id }],
		},
	)) as BetterAuthUserDoc | null;
	if (existingByLinkedUser?._id) {
		return {
			status: "reused" as const,
			userId: existingByLinkedUser._id,
		};
	}

	const existingByEmail = (await ctx.runQuery(
		components.betterAuth.adapter.findOne,
		{
			model: "user",
			where: [{ field: "email", value: row.user.email }],
		},
	)) as BetterAuthUserDoc | null;
	if (existingByEmail?._id) {
		if (existingByEmail.userId !== row.user._id) {
			await ctx.runMutation(components.betterAuth.adapter.updateOne, {
				input: {
					model: "user",
					where: [{ field: "_id", value: existingByEmail._id }],
					update: {
						userId: row.user._id,
						name: row.user.name ?? row.user.email,
						image: row.user.image ?? null,
						emailVerified: Boolean(row.user.emailVerificationTime),
						updatedAt: Date.now(),
					},
				},
			});
		}
		return {
			status: "reused" as const,
			userId: existingByEmail._id,
		};
	}

	const createdUser = (await ctx.runMutation(
		components.betterAuth.adapter.create,
		{
			input: {
				model: "user",
				data: buildBetterAuthUserData(row.user),
			},
		},
	)) as BetterAuthUserDoc;

	return {
		status: "created" as const,
		userId: createdUser._id,
	};
}

async function ensureBetterAuthFacebookAccount(
	ctx: ActionCtx,
	row: LegacyUserBackfillRow,
	betterAuthUserId: string,
) {
	const accountData = buildBetterAuthAccountData(row, betterAuthUserId);
	if (!accountData) {
		return "skipped_no_facebook_account" as const;
	}

	const existingAccount = (await ctx.runQuery(
		components.betterAuth.adapter.findOne,
		{
			model: "account",
			where: [
				{ field: "providerId", value: accountData.providerId },
				{ field: "accountId", value: accountData.accountId, connector: "AND" },
			],
		},
	)) as BetterAuthAccountDoc | null;

	if (existingAccount?._id) {
		await ctx.runMutation(components.betterAuth.adapter.updateOne, {
			input: {
				model: "account",
				where: [{ field: "_id", value: existingAccount._id }],
				update: {
					userId: betterAuthUserId,
					accessToken: accountData.accessToken,
					accessTokenExpiresAt: accountData.accessTokenExpiresAt,
					updatedAt: Date.now(),
				},
			},
		});
		return "updated" as const;
	}

	await ctx.runMutation(components.betterAuth.adapter.create, {
		input: {
			model: "account",
			data: accountData,
		},
	});
	return "created" as const;
}

export const backfillBetterAuthFromLegacyAuth = internalAction({
	args: {
		dryRun: v.optional(v.boolean()),
	},
	handler: async (
		ctx,
		{ dryRun },
	): Promise<BetterAuthBackfillPreview | BetterAuthBackfillResult> => {
		const preview: BetterAuthBackfillPreview = await ctx.runQuery(
			internal.migrations.previewBetterAuthBackfill,
			{},
		);
		if (dryRun) {
			return preview;
		}

		const users = await ctx.runQuery(internal.migrations.listLegacyUsers, {});
		const results: Array<{
			userId: Id<"users">;
			email: string | null;
			userStatus: string;
			accountStatus: string;
			betterAuthUserId?: string;
		}> = [];

		for (const user of users) {
			if (user.betterAuthUserId) {
				results.push({
					userId: user._id,
					email: user.email ?? null,
					userStatus: "already_linked",
					accountStatus: "skipped",
					betterAuthUserId: user.betterAuthUserId,
				});
				continue;
			}

			const facebookAccount = await ctx.runQuery(
				internal.migrations.getLegacyFacebookAccountForUser,
				{ userId: user._id },
			);
			const facebookToken = await ctx.runQuery(
				internal.migrations.getLegacyFacebookTokenForUser,
				{ userId: user._id },
			);
			const row = {
				user,
				facebookAccount,
				facebookToken,
			} satisfies LegacyUserBackfillRow;

			const betterAuthUser = await findOrCreateBetterAuthUser(ctx, row);
			if (betterAuthUser.status === "skipped_missing_email") {
				results.push({
					userId: user._id,
					email: user.email ?? null,
					userStatus: "skipped_missing_email",
					accountStatus: "skipped",
				});
				continue;
			}

			await ctx.runMutation(internal.migrations.patchUserBetterAuthLink, {
				userId: user._id,
				betterAuthUserId: betterAuthUser.userId,
			});

			const accountStatus = await ensureBetterAuthFacebookAccount(
				ctx,
				row,
				betterAuthUser.userId,
			);

			results.push({
				userId: user._id,
				email: user.email ?? null,
				userStatus: betterAuthUser.status,
				accountStatus,
				betterAuthUserId: betterAuthUser.userId,
			});
		}

		return {
			processed: results.length,
			results,
		} satisfies BetterAuthBackfillResult;
	},
});

export const getLegacyFacebookAccountForUser = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("authAccounts")
			.withIndex("userIdAndProvider", (q) =>
				q.eq("userId", userId).eq("provider", "facebook"),
			)
			.first();
	},
});

export const getLegacyFacebookTokenForUser = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		return await ctx.db
			.query("facebookTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
	},
});
