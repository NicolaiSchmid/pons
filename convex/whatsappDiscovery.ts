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
 * Discover ALL phone numbers across ALL businesses and WABAs in a single call.
 * Flattens the hierarchy so the UI can show a flat list with context labels.
 * Returns: [{ phoneNumber, businessName, wabaId, wabaName }]
 */
export const discoverAllNumbers = action({
	args: {},
	handler: async (
		ctx,
	): Promise<
		Array<{
			id: string;
			display_phone_number: string;
			verified_name: string;
			quality_rating: string;
			businessName: string;
			businessId: string;
			wabaId: string;
			wabaName: string;
		}>
	> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		// 1. Get all businesses
		const bizRes = await fetch(
			`${META_API_BASE}/me/businesses?fields=id,name&access_token=${token}`,
		);
		if (!bizRes.ok) {
			const error = await bizRes.json();
			throw new Error(
				`Failed to fetch businesses: ${error.error?.message ?? bizRes.statusText}`,
			);
		}
		const bizData = await bizRes.json();
		const businesses = (bizData.data ?? []) as MetaBusiness[];

		const results: Array<{
			id: string;
			display_phone_number: string;
			verified_name: string;
			quality_rating: string;
			businessName: string;
			businessId: string;
			wabaId: string;
			wabaName: string;
		}> = [];

		// 2. For each business, get WABAs
		for (const biz of businesses) {
			const wabaRes = await fetch(
				`${META_API_BASE}/${biz.id}/owned_whatsapp_business_accounts?fields=id,name&access_token=${token}`,
			);
			if (!wabaRes.ok) continue;
			const wabaData = await wabaRes.json();
			const wabas = (wabaData.data ?? []) as MetaWaba[];

			// 3. For each WABA, get phone numbers
			for (const waba of wabas) {
				const phoneRes = await fetch(
					`${META_API_BASE}/${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${token}`,
				);
				if (!phoneRes.ok) continue;
				const phoneData = await phoneRes.json();
				const phones = (phoneData.data ?? []) as MetaPhoneNumber[];

				for (const phone of phones) {
					results.push({
						id: phone.id,
						display_phone_number: phone.display_phone_number,
						verified_name: phone.verified_name,
						quality_rating: phone.quality_rating,
						businessName: biz.name,
						businessId: biz.id,
						wabaId: waba.id,
						wabaName: waba.name,
					});
				}
			}
		}

		return results;
	},
});

/**
 * Subscribe a WABA to webhooks for receiving messages.
 * This registers the WABA to receive webhooks via the app's webhook endpoint.
 */
export const subscribeWaba = action({
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
				`Failed to subscribe WABA: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return { success: data.success === true };
	},
});

/**
 * Register the app-level webhook endpoint with Meta.
 * Uses an App Access Token (app_id|app_secret) to call POST /{app-id}/subscriptions.
 * This sets the callback URL and verify token for whatsapp_business_account webhooks.
 * Only needs to be called once (or when URL/token changes), but is idempotent.
 */
export const registerAppWebhook = action({
	args: {},
	handler: async (ctx): Promise<{ success: boolean }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const appId = process.env.FACEBOOK_APP_ID;
		const appSecret = process.env.FACEBOOK_APP_SECRET;
		const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
		const callbackUrl = process.env.WEBHOOK_CALLBACK_URL;

		if (!appId || !appSecret || !verifyToken || !callbackUrl) {
			throw new Error(
				"Missing env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, WEBHOOK_VERIFY_TOKEN, or WEBHOOK_CALLBACK_URL",
			);
		}

		// App Access Token = "app_id|app_secret"
		const appAccessToken = `${appId}|${appSecret}`;

		const res = await fetch(`${META_API_BASE}/${appId}/subscriptions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				object: "whatsapp_business_account",
				callback_url: callbackUrl,
				verify_token: verifyToken,
				fields: "messages",
				access_token: appAccessToken,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to register app webhook: ${error.error?.message ?? res.statusText}`,
			);
		}

		const data = await res.json();
		return { success: data.success === true };
	},
});
