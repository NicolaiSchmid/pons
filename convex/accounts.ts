import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

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

		return accounts.filter(Boolean);
	},
});

// Get a single account by ID (with access check)
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

		return ctx.db.get(args.accountId);
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
		webhookVerifyToken: v.string(),
		appSecret: v.string(),
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
		webhookVerifyToken: v.optional(v.string()),
		appSecret: v.optional(v.string()),
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

// Find a user by email (for inviting)
export const findUserByEmail = query({
	args: { email: v.string() },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

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

// Update a member's role
export const updateMemberRole = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	handler: async (ctx, args) => {
		const currentUserId = await auth.getUserId(ctx);
		if (!currentUserId) throw new Error("Unauthorized");

		// Check caller is owner or admin
		const callerMembership = await ctx.db
			.query("accountMembers")
			.withIndex("by_account_user", (q) =>
				q.eq("accountId", args.accountId).eq("userId", currentUserId),
			)
			.first();

		if (!callerMembership || callerMembership.role === "member") {
			throw new Error("Only owners and admins can change roles");
		}

		// Can't change the owner's role
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

		await ctx.db.patch(targetMembership._id, { role: args.role });
	},
});

// Get account by phone number ID (for webhook processing)
// NOTE: This is a public query because the webhook route uses ConvexHttpClient.
// Only returns fields needed for webhook processing — no access token.
export const getByPhoneNumberId = query({
	args: { phoneNumberId: v.string() },
	handler: async (ctx, args) => {
		const account = await ctx.db
			.query("accounts")
			.withIndex("by_phone_number_id", (q) =>
				q.eq("phoneNumberId", args.phoneNumberId),
			)
			.first();

		if (!account) return null;

		return {
			_id: account._id,
			name: account.name,
			phoneNumberId: account.phoneNumberId,
			phoneNumber: account.phoneNumber,
			appSecret: account.appSecret,
			webhookVerifyToken: account.webhookVerifyToken,
		};
	},
});

// Remove a member from an account
export const removeMember = mutation({
	args: {
		accountId: v.id("accounts"),
		userId: v.id("users"),
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
			throw new Error("Only admins and owners can remove members");
		}

		// Can't remove the owner
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

		await ctx.db.delete(targetMembership._id);
	},
});
