import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { auth } from "./auth";

// Helper to check account access
async function checkAccountAccess(
  ctx: { db: any },
  userId: any,
  accountId: any
) {
  const membership = await ctx.db
    .query("accountMembers")
    .withIndex("by_account_user", (q: any) =>
      q.eq("accountId", accountId).eq("userId", userId)
    )
    .first();
  return !!membership;
}

// List contacts for an account
export const list = query({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
    if (!hasAccess) return [];

    return ctx.db
      .query("contacts")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

// Get a single contact
export const get = query({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const contact = await ctx.db.get(args.contactId);
    if (!contact) return null;

    const hasAccess = await checkAccountAccess(ctx, userId, contact.accountId);
    if (!hasAccess) return null;

    return contact;
  },
});

// Get or create a contact by WhatsApp ID
export const getOrCreate = mutation({
  args: {
    accountId: v.id("accounts"),
    waId: v.string(),
    phone: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const hasAccess = await checkAccountAccess(ctx, userId, args.accountId);
    if (!hasAccess) throw new Error("Unauthorized");

    // Check if contact exists
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_account_wa_id", (q) =>
        q.eq("accountId", args.accountId).eq("waId", args.waId)
      )
      .first();

    if (existing) {
      // Update name if provided and different
      if (args.name && args.name !== existing.name) {
        await ctx.db.patch(existing._id, { name: args.name });
      }
      return existing._id;
    }

    // Create new contact
    return ctx.db.insert("contacts", {
      accountId: args.accountId,
      waId: args.waId,
      phone: args.phone,
      name: args.name,
    });
  },
});

// Update contact name
export const updateName = mutation({
  args: {
    contactId: v.id("contacts"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const contact = await ctx.db.get(args.contactId);
    if (!contact) throw new Error("Contact not found");

    const hasAccess = await checkAccountAccess(ctx, userId, contact.accountId);
    if (!hasAccess) throw new Error("Unauthorized");

    await ctx.db.patch(args.contactId, { name: args.name });
    return args.contactId;
  },
});

// Internal mutation for webhook processing (no auth check)
export const getOrCreateInternal = mutation({
  args: {
    accountId: v.id("accounts"),
    waId: v.string(),
    phone: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if contact exists
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_account_wa_id", (q) =>
        q.eq("accountId", args.accountId).eq("waId", args.waId)
      )
      .first();

    if (existing) {
      // Update name if provided and different
      if (args.name && args.name !== existing.name) {
        await ctx.db.patch(existing._id, { name: args.name });
      }
      return existing._id;
    }

    // Create new contact
    return ctx.db.insert("contacts", {
      accountId: args.accountId,
      waId: args.waId,
      phone: args.phone,
      name: args.name,
    });
  },
});
