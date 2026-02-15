import { v } from "convex/values";
import { query } from "./_generated/server";
import { auth } from "./auth";
import { checkAccountAccess } from "./helpers";

// List templates for an account
export const list = query({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
		if (!hasAccess) return [];

		return ctx.db
			.query("templates")
			.withIndex("by_account", (q) => q.eq("accountId", args.accountId))
			.collect();
	},
});

// Get a single template
export const get = query({
	args: { templateId: v.id("templates") },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const template = await ctx.db.get(args.templateId);
		if (!template) return null;

		const hasAccess = await checkAccountAccess(ctx, userId, template.accountId);
		if (!hasAccess) return null;

		return template;
	},
});
