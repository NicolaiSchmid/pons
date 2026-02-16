import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Safe account fields returned to the browser (no secrets)
function stripSecrets(account: {
	_id: import("./_generated/dataModel").Id<"accounts">;
	_creationTime: number;
	name: string;
	wabaId: string;
	phoneNumberId: string;
	phoneNumber: string;
	accessToken: string;
	ownerId: import("./_generated/dataModel").Id<"users">;
}) {
	return {
		_id: account._id,
		_creationTime: account._creationTime,
		name: account.name,
		wabaId: account.wabaId,
		phoneNumberId: account.phoneNumberId,
		phoneNumber: account.phoneNumber,
		ownerId: account.ownerId,
	};
}

// Get all accounts the current user has access to
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		// Get accounts where user is a member
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

// Get a single account by ID (with access check, no secrets)
export const get = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		// Check membership
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

// Get account secrets for admin settings page (admin/owner only)
export const getSecrets = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		// Check admin/owner role
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (!membership || membership.role === "member") return null;

		const account = await ctx.db.get(args.accountId);
		if (!account) return null;

		return {
			accessToken: account.accessToken,
		};
	},
});

// Get full account by ID (internal only — includes secrets for server-side use)
export const getInternal = internalQuery({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.accountId);
	},
});

// Get account by phone number ID (internal only)
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

// Check if a user is a member of an account (internal — used by UI action wrappers)
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

// Create a new WhatsApp Business Account
export const create = mutation({
	args: {
		name: v.string(),
		wabaId: v.string(),
		phoneNumberId: v.string(),
		phoneNumber: v.string(),
		accessToken: v.string(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Create the account
		const accountId = await ctx.db.insert("accounts", {
			...args,
			ownerId: userId,
		});

		// Add owner as a member
		await ctx.db.insert("accountMembers", {
			accountId,
			userId,
			role: "owner",
		});

		return accountId;
	},
});

// Update account settings
export const update = mutation({
	args: {
		accountId: v.id("accounts"),
		name: v.optional(v.string()),
		accessToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Check admin/owner role
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

// Delete an account
export const remove = mutation({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Check owner role
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", userId),
			)
			.first();

		if (membership?.role !== "owner") {
			throw new Error("Only owners can delete accounts");
		}

		// Delete all related data
		// 1. Delete messages
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const msg of messages) {
			await ctx.db.delete(msg._id);
		}

		// 2. Delete conversations
		const conversations = await ctx.db
			.query("conversations")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const conv of conversations) {
			await ctx.db.delete(conv._id);
		}

		// 3. Delete contacts
		const contacts = await ctx.db
			.query("contacts")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const contact of contacts) {
			await ctx.db.delete(contact._id);
		}

		// 4. Delete templates
		const templates = await ctx.db
			.query("templates")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const template of templates) {
			await ctx.db.delete(template._id);
		}

		// 5. Delete members
		const members = await ctx.db
			.query("accountMembers")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const member of members) {
			await ctx.db.delete(member._id);
		}

		// 6. Delete webhook logs
		const logs = await ctx.db
			.query("webhookLogs")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const log of logs) {
			await ctx.db.delete(log._id);
		}

		// 7. Delete API keys
		const apiKeys = await ctx.db
			.query("apiKeys")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
		for (const key of apiKeys) {
			await ctx.db.delete(key._id);
		}

		// Finally delete the account
		await ctx.db.delete(args.accountId);
	},
});

// Add a member to an account
export const addMember = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		// Check admin/owner role
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can add members");
		}

		// Check if already a member
		const existing = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", args.userId),
			)
			.first();

		if (existing) {
			throw new Error("User is already a member");
		}

		return ctx.db.insert("accountMembers", {
			accountId: args.accountId,
			userId: args.userId,
			role: args.role,
		});
	},
});

// Add a member by email address (looks up the user first)
export const addMemberByEmail = mutation({
	args: {
		accountId: v.id("accounts"),
		email: v.string(),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		// Check admin/owner role
		const membership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!membership || membership.role === "member") {
			throw new Error("Only admins and owners can add members");
		}

		// Look up user by email
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", args.email))
			.first();

		if (!user) {
			throw new Error(
				"No user found with that email. They must sign in at least once first.",
			);
		}

		// Check if already a member
		const existing = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", user._id),
			)
			.first();

		if (existing) {
			throw new Error("User is already a member");
		}

		return ctx.db.insert("accountMembers", {
			accountId: args.accountId,
			userId: user._id,
			role: args.role,
		});
	},
});

// List members for an account (with user details)
export const listMembers = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		// Check the caller has access
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

		// Sort: owner first, then admin, then member
		const roleOrder = { owner: 0, admin: 1, member: 2 };
		return members.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
	},
});

// Find a user by email (for inviting). Requires admin/owner of the account
// to prevent unauthenticated user enumeration.
export const findUserByEmail = query({
	args: {
		accountId: v.id("accounts"),
		email: v.string(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		// Verify caller is admin/owner of the account
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

// Update a member's role.
// Role hierarchy: owner > admin > member.
// - Owners can change anyone's role (except their own).
// - Admins can only promote/demote members, NOT other admins.
// - Members cannot change roles.
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

		// Admins can only modify members, not other admins
		if (
			callerMembership.role === "admin" &&
			targetMembership.role === "admin"
		) {
			throw new Error("Only the owner can change an admin's role");
		}

		await ctx.db.patch(targetMembership._id, { role: args.role });
	},
});

// Remove a member from an account.
// Role hierarchy: owner > admin > member.
// - Owners can remove anyone (except themselves).
// - Admins can only remove members, NOT other admins.
// - Members cannot remove anyone.
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

		if (!targetMembership) {
			throw new Error("User is not a member");
		}

		if (targetMembership.role === "owner") {
			throw new Error("Cannot remove the owner");
		}

		// Admins can only remove members, not other admins
		if (
			callerMembership.role === "admin" &&
			targetMembership.role === "admin"
		) {
			throw new Error("Only the owner can remove an admin");
		}

		await ctx.db.delete(targetMembership._id);
	},
});
