import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { auth } from "./auth";
import { registrationStep } from "./schema";

// ── Types ──

type Account = Doc<"accounts">;

type StrippedAccount = {
	_id: Id<"accounts">;
	_creationTime: number;
	name: string;
	wabaId: string;
	phoneNumberId?: string;
	phoneNumber: string;
	displayName: string;
	status: Account["status"];
	numberProvider: Account["numberProvider"];
	ownerId: Id<"users">;
	// Failure info (only when status = "failed")
	failedAtStep?: Account["failedAtStep"];
	failedError?: string;
	failedAt?: number;
	// Name review (only when status = "pending_name_review")
	nameReviewCheckCount?: number;
	// True when the Twilio SMS webhook has captured the Meta OTP
	hasVerificationCode?: boolean;
};

// ── Helpers ──

/** Safe account fields returned to the browser (no secrets, no ephemeral verification data) */
function stripSecrets(account: Account): StrippedAccount {
	return {
		_id: account._id,
		_creationTime: account._creationTime,
		name: account.name,
		wabaId: account.wabaId,
		phoneNumberId: account.phoneNumberId,
		phoneNumber: account.phoneNumber,
		displayName: account.displayName,
		status: account.status,
		numberProvider: account.numberProvider,
		ownerId: account.ownerId,
		// Include failure info so UI can show error + retry
		failedAtStep: account.failedAtStep,
		failedError: account.failedError,
		failedAt: account.failedAt,
		// Include name review progress
		nameReviewCheckCount: account.nameReviewCheckCount,
		// Let the frontend know the webhook captured the OTP (without leaking the code)
		hasVerificationCode: !!account.verificationCode,
	};
}

/**
 * Valid state transitions. Key = current status, value = allowed next statuses.
 * "failed" can be reached from any non-terminal state (handled separately).
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
	adding_number: ["code_requested"],
	code_requested: ["verifying_code"],
	verifying_code: ["registering"],
	registering: ["registering", "pending_name_review"], // self-transition to store PIN
	pending_name_review: ["active", "name_declined"],
	// Terminal states — no transitions out (except retry from failed)
	active: [],
	name_declined: [],
	failed: ["adding_number", "code_requested", "verifying_code", "registering"],
};

function assertTransition(
	current: string,
	next: string,
	accountId: Id<"accounts">,
) {
	// Any non-terminal state can transition to "failed"
	if (
		next === "failed" &&
		current !== "active" &&
		current !== "name_declined"
	) {
		return;
	}
	const allowed = VALID_TRANSITIONS[current];
	if (!allowed || !allowed.includes(next)) {
		throw new Error(
			`Invalid state transition: ${current} → ${next} (account ${accountId})`,
		);
	}
}

// ============================================================================
// QUERIES
// ============================================================================

/** Get all accounts the current user has access to */
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const memberships = await ctx.db
			.query("accountMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const accounts = await Promise.all(
			memberships.map((m) => ctx.db.get(m.accountId)),
		);

		return accounts
			.filter((a): a is NonNullable<typeof a> => a !== null)
			.map(stripSecrets);
	},
});

/** Get a single account by ID (with access check, no secrets) */
export const get = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership) return null;

		const account = await ctx.db.get(args.accountId);
		if (!account) return null;

		return stripSecrets(account);
	},
});

/** Get full account by ID (internal only — includes secrets for server-side use) */
export const getInternal = internalQuery({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.accountId);
	},
});

/** Get account by phone number ID (internal only — for webhook routing) */
export const getByPhoneNumberIdInternal = internalQuery({
	args: { phoneNumberId: v.string() },
	handler: async (ctx, args) => {
		return ctx.db
			.query("accounts")
			.withIndex("by_phone_number_id", (q) =>
				q.eq("phoneNumberId", args.phoneNumberId),
			)
			.first();
	},
});

/** Check if a user is a member of an account (internal) */
export const checkMembership = internalQuery({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", args.userId),
			)
			.first();
		return !!membership;
	},
});

// ============================================================================
// ACCOUNT CREATION
// ============================================================================

/**
 * Create an account for an existing phone number on the WABA.
 *
 * If the number is already registered with the Cloud API, sets status
 * to "active". If not, sets status to "registering" so the UI can
 * prompt for a 2FA PIN and call registerExistingNumber.
 */
export const createExisting = mutation({
	args: {
		name: v.string(),
		wabaId: v.string(),
		phoneNumberId: v.string(),
		phoneNumber: v.string(),
		displayName: v.string(),
		isRegistered: v.optional(v.boolean()), // true if Meta says CONNECTED
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const needsRegistration = args.isRegistered === false;

		const accountId = await ctx.db.insert("accounts", {
			ownerId: userId,
			name: args.name,
			wabaId: args.wabaId,
			phoneNumberId: args.phoneNumberId,
			phoneNumber: args.phoneNumber,
			displayName: args.displayName,
			status: needsRegistration ? "registering" : "active",
			numberProvider: "existing",
		});

		await ctx.db.insert("accountMembers", {
			accountId,
			userId,
			role: "owner",
		});

		return accountId;
	},
});

/**
 * Create an account for a BYON (Bring Your Own Number) phone.
 * Starts at "adding_number" — the number hasn't been added to the WABA yet.
 */
export const createByon = mutation({
	args: {
		name: v.string(),
		wabaId: v.string(),
		phoneNumber: v.string(), // E.164: "+4917612345678"
		displayName: v.string(),
		countryCode: v.string(), // "49", "1", etc.
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const accountId = await ctx.db.insert("accounts", {
			ownerId: userId,
			name: args.name,
			wabaId: args.wabaId,
			phoneNumber: args.phoneNumber,
			displayName: args.displayName,
			countryCode: args.countryCode,
			status: "adding_number",
			numberProvider: "byon",
		});

		await ctx.db.insert("accountMembers", {
			accountId,
			userId,
			role: "owner",
		});

		return accountId;
	},
});

/**
 * Create an account for a Twilio Connect number.
 * Starts at "adding_number" — we have the Twilio number but it's not on the WABA yet.
 */
export const createTwilio = mutation({
	args: {
		name: v.string(),
		wabaId: v.string(),
		phoneNumber: v.string(),
		displayName: v.string(),
		countryCode: v.string(),
		twilioCredentialsId: v.id("twilioCredentials"),
		twilioPhoneNumberSid: v.string(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const accountId = await ctx.db.insert("accounts", {
			ownerId: userId,
			name: args.name,
			wabaId: args.wabaId,
			phoneNumber: args.phoneNumber,
			displayName: args.displayName,
			countryCode: args.countryCode,
			status: "adding_number",
			numberProvider: "twilio",
			twilioCredentialsId: args.twilioCredentialsId,
			twilioPhoneNumberSid: args.twilioPhoneNumberSid,
		});

		await ctx.db.insert("accountMembers", {
			accountId,
			userId,
			role: "owner",
		});

		return accountId;
	},
});

// ============================================================================
// STATE TRANSITIONS (internal — called from phoneRegistration actions)
// ============================================================================

/** Transition to code_requested after phone number was added to WABA */
export const transitionToCodeRequested = internalMutation({
	args: {
		accountId: v.id("accounts"),
		phoneNumberId: v.string(), // Meta returns this after adding
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "code_requested", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "code_requested",
			phoneNumberId: args.phoneNumberId,
		});
	},
});

/** Transition to verifying_code after user submits OTP */
export const transitionToVerifyingCode = internalMutation({
	args: {
		accountId: v.id("accounts"),
		verificationCode: v.string(),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "verifying_code", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "verifying_code",
			verificationCode: args.verificationCode,
		});
	},
});

/** Transition to registering after code verification succeeds */
export const transitionToRegistering = internalMutation({
	args: {
		accountId: v.id("accounts"),
		twoStepPin: v.string(), // 6-digit 2FA pin
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "registering", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "registering",
			twoStepPin: args.twoStepPin,
			verificationCode: undefined, // Clear ephemeral OTP
		});
	},
});

/** Transition to pending_name_review after registration succeeds */
export const transitionToPendingNameReview = internalMutation({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "pending_name_review", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "pending_name_review",
			nameReviewCheckCount: 0,
			nameReviewMaxChecks: 120, // 5 days at 1 check/hour (covers weekends)
		});
	},
});

/** Transition to active (name approved or existing number) */
export const transitionToActive = internalMutation({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "active", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "active",
			nameReviewNotifiedAt: Date.now(),
		});
	},
});

/** Transition to name_declined */
export const transitionToNameDeclined = internalMutation({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "name_declined", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "name_declined",
			nameReviewNotifiedAt: Date.now(),
		});
	},
});

/** Transition to failed from any non-terminal state */
export const transitionToFailed = internalMutation({
	args: {
		accountId: v.id("accounts"),
		failedAtStep: registrationStep,
		failedError: v.string(),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		assertTransition(account.status, "failed", args.accountId);

		await ctx.db.patch(args.accountId, {
			status: "failed",
			failedAtStep: args.failedAtStep,
			failedError: args.failedError,
			failedAt: Date.now(),
		});
	},
});

/**
 * Retry from failed state — resets to the step that failed.
 * Clears failure fields so the step can be re-attempted.
 */
export const retryFromFailed = mutation({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership) throw new Error("Unauthorized");

		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		if (account.status !== "failed") {
			throw new Error("Can only retry from failed state");
		}
		if (!account.failedAtStep) {
			throw new Error("No failed step recorded — cannot retry");
		}

		await ctx.db.patch(args.accountId, {
			status: account.failedAtStep,
			failedAtStep: undefined,
			failedError: undefined,
			failedAt: undefined,
		});

		return account.failedAtStep;
	},
});

/**
 * Store the auto-captured verification code from Twilio SMS webhook.
 * Does NOT transition state — the phoneRegistration action will do that.
 */
export const storeVerificationCode = internalMutation({
	args: {
		accountId: v.id("accounts"),
		verificationCode: v.string(),
	},
	handler: async (ctx, args) => {
		const account = await ctx.db.get(args.accountId);
		if (!account) throw new Error("Account not found");
		if (account.status !== "code_requested") {
			throw new Error(
				`Cannot store verification code in status: ${account.status}`,
			);
		}

		await ctx.db.patch(args.accountId, {
			verificationCode: args.verificationCode,
		});
	},
});

/**
 * Update name review polling fields (internal — called by nameReview polling workflow)
 */
export const updateNameReviewProgress = internalMutation({
	args: {
		accountId: v.id("accounts"),
		lastCheckedAt: v.number(),
		checkCount: v.number(),
		scheduledJobId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.accountId, {
			nameReviewLastCheckedAt: args.lastCheckedAt,
			nameReviewCheckCount: args.checkCount,
			nameReviewScheduledJobId: args.scheduledJobId,
		});
	},
});

// ============================================================================
// ACCOUNT UPDATES
// ============================================================================

/** Update account settings */
export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		name: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Unauthorized");
		}

		const { accountId, ...updates } = args;
		const filteredUpdates = Object.fromEntries(
			Object.entries(updates).filter(([_, v]) => v !== undefined),
		);

		await ctx.db.patch(accountId, filteredUpdates);
		return accountId;
	},
});

/** Delete an account (cascade deletes all related data) */
export const remove = mutation({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (membership?.role !== "owner") {
			throw new Error("Only owners can delete accounts");
		}

		// Delete all related data (apiKeys are user-scoped, not deleted with account)
		const tables = [
			"messages",
			"conversations",
			"contacts",
			"templates",
			"accountMembers",
			"webhookLogs",
		] as const;

		for (const table of tables) {
			const rows = await ctx.db
				.query(table)
				.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
				.collect();
			for (const row of rows) {
				await ctx.db.delete(row._id);
			}
		}

		await ctx.db.delete(args.accountId);
	},
});

// ============================================================================
// MEMBER MANAGEMENT
// ============================================================================

export const addMember = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can add members");
		}

		const existing = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", args.userId),
			)
			.first();

		if (existing) throw new Error("User is already a member");

		return ctx.db.insert("accountMembers", {
			accountId: args.accountId,
			userId: args.userId,
			role: args.role,
		});
	},
});

export const addMemberByEmail = mutation({
	args: {
		accountId: v.id("accounts"),
		email: v.string(),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can add members");
		}

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();

		if (!user) {
			throw new Error(
				"No user found with that email. They must sign in at least once first.",
			);
		}

		const existing = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", user._id),
			)
			.first();

		if (existing) throw new Error("User is already a member");

		return ctx.db.insert("accountMembers", {
			accountId: args.accountId,
			userId: user._id,
			role: args.role,
		});
	},
});

export const listMembers = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const callerMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();
		if (!callerMembership) return [];

		const memberships = await ctx.db
			.query("accountMembers")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();

		const members = await Promise.all(
			memberships.map(async (m) => {
				const user = await ctx.db.get(m.userId);
				return {
					membershipId: m._id,
					userId: m.userId,
					role: m.role,
					name: user?.name ?? null,
					email: user?.email ?? null,
					image: user?.image ?? null,
				};
			}),
		);

		const roleOrder = { owner: 0, admin: 1, member: 2 };
		return members.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
	},
});

export const findUserByEmail = query({
	args: {
		accountId: v.id("accounts"),
		email: v.string(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership || membership.role === "member") return null;

		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();

		if (!user) return null;

		return {
			userId: user._id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
		};
	},
});

export const updateMemberRole = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		const callerMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!callerMembership || callerMembership.role === "member") {
			throw new Error("Only owners and admins can change roles");
		}

		const targetMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", args.userId),
			)
			.first();

		if (!targetMembership) throw new Error("User is not a member");
		if (targetMembership.role === "owner") {
			throw new Error("Cannot change the owner's role");
		}
		if (
			callerMembership.role === "admin" &&
			targetMembership.role === "admin"
		) {
			throw new Error("Only the owner can change an admin's role");
		}

		await ctx.db.patch(targetMembership._id, { role: args.role });
	},
});

export const removeMember = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		const callerMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!callerMembership || callerMembership.role === "member") {
			throw new Error("Only admins and owners can remove members");
		}

		const targetMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", args.userId),
			)
			.first();

		if (!targetMembership) throw new Error("User is not a member");
		if (targetMembership.role === "owner") {
			throw new Error("Cannot remove the owner");
		}
		if (
			callerMembership.role === "admin" &&
			targetMembership.role === "admin"
		) {
			throw new Error("Only the owner can remove an admin");
		}

		await ctx.db.delete(targetMembership._id);
	},
});
