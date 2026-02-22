import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { auth } from "./auth";
import { metaFetch } from "./metaFetch";

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
	platform_type?: string; // "CLOUD_API" | "ON_PREMISE" | "NOT_APPLICABLE"
	is_official_business_account?: boolean;
};

type MetaListResponse<T> = {
	data?: T[];
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

		const data = await metaFetch<MetaListResponse<MetaBusiness>>(
			"me/businesses?fields=id,name",
			token,
		);
		return data.data ?? [];
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

		const data = await metaFetch<MetaListResponse<MetaWaba>>(
			`${businessId}/owned_whatsapp_business_accounts?fields=id,name,message_template_namespace`,
			token,
		);
		return data.data ?? [];
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

		const data = await metaFetch<MetaListResponse<MetaPhoneNumber>>(
			`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier,platform_type,is_official_business_account`,
			token,
		);
		return data.data ?? [];
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
			code_verification_status?: string;
			status?: string;
			platform_type?: string;
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
		const bizData = await metaFetch<MetaListResponse<MetaBusiness>>(
			"me/businesses?fields=id,name",
			token,
		);
		const businesses = bizData.data ?? [];

		const results: Array<{
			id: string;
			display_phone_number: string;
			verified_name: string;
			quality_rating: string;
			code_verification_status?: string;
			status?: string;
			platform_type?: string;
			businessName: string;
			businessId: string;
			wabaId: string;
			wabaName: string;
		}> = [];

		// 2. For each business, get WABAs
		for (const biz of businesses) {
			let wabaData: MetaListResponse<MetaWaba>;
			try {
				wabaData = await metaFetch<MetaListResponse<MetaWaba>>(
					`${biz.id}/owned_whatsapp_business_accounts?fields=id,name`,
					token,
				);
			} catch {
				continue;
			}
			const wabas = wabaData.data ?? [];

			// 3. For each WABA, get phone numbers
			for (const waba of wabas) {
				let phoneData: MetaListResponse<MetaPhoneNumber>;
				try {
					phoneData = await metaFetch<MetaListResponse<MetaPhoneNumber>>(
						`${waba.id}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type`,
						token,
					);
				} catch {
					continue;
				}
				const phones = phoneData.data ?? [];

				for (const phone of phones) {
					results.push({
						id: phone.id,
						display_phone_number: phone.display_phone_number,
						verified_name: phone.verified_name,
						quality_rating: phone.quality_rating,
						code_verification_status: phone.code_verification_status,
						status: phone.status,
						platform_type: phone.platform_type,
						businessName: biz.name,
						businessId: biz.id,
						wabaId: waba.id,
						wabaName: waba.name,
					});
				}
			}
		}

		// Log for debugging — helps identify platform_type values
		for (const r of results) {
			console.log(
				`discoverAllNumbers: ${r.display_phone_number} → status=${r.status}, platform_type=${r.platform_type}, code_verification=${r.code_verification_status}`,
			);
		}

		return results;
	},
});

/**
 * Subscribe a WABA to webhooks for receiving messages.
 * This registers the WABA to receive webhooks via the app's webhook endpoint.
 *
 * NOTE: Meta requires `access_token` in the JSON body for this endpoint.
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

		const data = await metaFetch<{ success: boolean }>(
			`${wabaId}/subscribed_apps`,
			token,
			{ method: "POST", body: {}, tokenInBody: true },
		);

		return { success: data.success === true };
	},
});

/**
 * Register the app-level webhook endpoint with Meta.
 * Uses an App Access Token (app_id|app_secret) to call POST /{app-id}/subscriptions.
 * This sets the callback URL and verify token for whatsapp_business_account webhooks.
 * Only needs to be called once (or when URL/token changes), but is idempotent.
 *
 * NOTE: Meta requires `access_token` in the JSON body for this endpoint.
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

		const data = await metaFetch<{ success: boolean }>(
			`${appId}/subscriptions`,
			appAccessToken,
			{
				method: "POST",
				body: {
					object: "whatsapp_business_account",
					callback_url: callbackUrl,
					verify_token: verifyToken,
					fields: "messages",
				},
				tokenInBody: true,
			},
		);

		return { success: data.success === true };
	},
});
