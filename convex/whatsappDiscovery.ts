import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { auth } from "./auth";

const META_API_VERSION = "v22.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

// ── Types ──

type MetaBusiness = {
	id: string;
	name: string;
};

type MetaWaba = {
	id: string;
	name: string;
	message_template_namespace?: string;
};

type MetaPhoneNumber = {
	id: string;
	display_phone_number: string;
	verified_name: string;
	quality_rating: string;
	code_verification_status?: string;
	status?: string;
	messaging_limit_tier?: string;
	platform_type?: string;
};

// ── Internal: get Facebook token for current user ──

export const getFacebookToken = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const token = await ctx.db
			.query("facebookTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();
		return token?.accessToken ?? null;
	},
});

// ── Actions: callable from the client ──

/**
 * Discover all Business Manager accounts the user has access to.
 * Returns: [{ id, name }]
 */
export const discoverBusinesses = action({
	args: {},
	handler: async (ctx): Promise<MetaBusiness[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		const res = await fetch(
			`${META_API_BASE}/me/businesses?fields=id,name&access_token=${token}`,
		);
		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to fetch businesses: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return (data.data ?? []) as MetaBusiness[];
	},
});

/**
 * Discover all WhatsApp Business Accounts under a Business Manager.
 * Returns: [{ id, name }]
 */
export const discoverWabas = action({
	args: { businessId: v.string() },
	handler: async (ctx, { businessId }): Promise<MetaWaba[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		const res = await fetch(
			`${META_API_BASE}/${businessId}/owned_whatsapp_business_accounts?fields=id,name,message_template_namespace&access_token=${token}`,
		);
		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to fetch WABAs: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return (data.data ?? []) as MetaWaba[];
	},
});

/**
 * Discover all phone numbers under a WABA.
 * Returns: [{ id, display_phone_number, verified_name, quality_rating, ... }]
 */
export const discoverPhoneNumbers = action({
	args: { wabaId: v.string() },
	handler: async (ctx, { wabaId }): Promise<MetaPhoneNumber[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		const res = await fetch(
			`${META_API_BASE}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier,platform_type&access_token=${token}`,
		);
		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to fetch phone numbers: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return (data.data ?? []) as MetaPhoneNumber[];
	},
});

/**
 * Subscribe a WABA to webhooks for receiving messages.
 * This registers pons.chat/api/webhook as the webhook endpoint for the WABA.
 */
export const subscribeWebhook = action({
	args: { wabaId: v.string() },
	handler: async (ctx, { wabaId }): Promise<{ success: boolean }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		// Subscribe the WABA to the app's webhooks
		const res = await fetch(`${META_API_BASE}/${wabaId}/subscribed_apps`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				access_token: token,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to subscribe webhook: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return { success: data.success === true };
	},
});
