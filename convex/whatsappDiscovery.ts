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

type ConnectionHealthIssue =
	| "token_missing"
	| "token_invalid"
	| "missing_required_scopes"
	| "missing_waba_target"
	| "app_webhook_inactive"
	| "waba_not_subscribed"
	| "phone_not_found"
	| "phone_not_connected"
	| "phone_not_cloud_api"
	| "owner_business_unverified"
	| "assigned_user_missing_manage";

type ConnectionHealthAction =
	| "reauth"
	| "repair_subscriptions"
	| "check_business_verification"
	| "check_asset_tasks"
	| "wait_and_retry";

type ConnectionHealthStatus = "unchecked" | "ok" | "attention" | "needs_reauth";

type DebugTokenResponse = {
	data?: {
		is_valid?: boolean;
		scopes?: string[];
		granular_scopes?: Array<{
			scope?: string;
			target_ids?: string[];
		}>;
	};
};

// ── Internal: get Facebook token for current user ──

export const getFacebookToken = internalQuery({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }): Promise<string | null> => {
		const token: {
			accessToken: string;
			expiresAt?: number;
		} | null = await ctx.runQuery(internal.auth.getFacebookAccount, {
			userId,
		});
		return token?.accessToken ?? null;
	},
});

function summarizeHealth(
	issues: ConnectionHealthIssue[],
	actions: ConnectionHealthAction[],
): { status: ConnectionHealthStatus; summary: string } {
	if (issues.length === 0) {
		return { status: "ok", summary: "Meta connection checks passed." };
	}

	if (actions.includes("reauth")) {
		return {
			status: "needs_reauth",
			summary:
				"Meta token or grants are incomplete. Re-authenticate via Embedded Signup.",
		};
	}

	return {
		status: "attention",
		summary:
			"Meta connection has recoverable issues. Run repair and verify business/task setup.",
	};
}

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
			{ tokenInBody: false },
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
			{ tokenInBody: false },
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
			{ tokenInBody: false },
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
			{ tokenInBody: false },
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
					{ tokenInBody: false },
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
						{ tokenInBody: false },
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
 * Unsubscribe the app from a WABA's webhook stream.
 *
 * Meta's endpoint expects the app id together with an access token.
 */
export const unsubscribeWaba = action({
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

		const appId = process.env.FACEBOOK_APP_ID;
		if (!appId) throw new Error("Missing env var: FACEBOOK_APP_ID");

		const data = await metaFetch<{ success: boolean }>(
			`${wabaId}/subscribed_apps`,
			token,
			{
				method: "DELETE",
				body: { app_id: appId },
				tokenInBody: true,
			},
		);

		return { success: data.success === true };
	},
});

/**
 * Validate end-to-end Meta connection health for one account.
 *
 * This is advisory only: it never mutates the account lifecycle status machine.
 */
export const checkConnectionHealth = action({
	args: { accountId: v.id("accounts") },
	handler: async (
		ctx,
		{ accountId },
	): Promise<{
		status: ConnectionHealthStatus;
		issues: ConnectionHealthIssue[];
		actions: ConnectionHealthAction[];
		summary: string;
		checks: {
			hasToken: boolean;
			tokenValid: boolean;
			hasRequiredScopes: boolean;
			hasWabaTarget: boolean;
			appWebhookActive: boolean;
			wabaSubscribed: boolean;
			phoneFound: boolean;
			phoneConnected: boolean;
			phoneCloudApi: boolean;
			ownerBusinessVerified: boolean;
			hasAssignedManager: boolean;
		};
	}> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const hasAccess = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId,
			userId,
		});
		if (!hasAccess) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId,
		});
		if (!account) throw new Error("Account not found");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);

		const appId = process.env.FACEBOOK_APP_ID;
		const appSecret = process.env.FACEBOOK_APP_SECRET;
		const callbackUrl = process.env.WEBHOOK_CALLBACK_URL;

		if (!appId || !appSecret || !callbackUrl) {
			throw new Error(
				"Missing env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, WEBHOOK_CALLBACK_URL",
			);
		}

		const issues: ConnectionHealthIssue[] = [];
		const actions: ConnectionHealthAction[] = [];

		const checks: {
			hasToken: boolean;
			tokenValid: boolean;
			hasRequiredScopes: boolean;
			hasWabaTarget: boolean;
			appWebhookActive: boolean;
			wabaSubscribed: boolean;
			phoneFound: boolean;
			phoneConnected: boolean;
			phoneCloudApi: boolean;
			ownerBusinessVerified: boolean;
			hasAssignedManager: boolean;
		} = {
			hasToken: !!token,
			tokenValid: false,
			hasRequiredScopes: false,
			hasWabaTarget: false,
			appWebhookActive: false,
			wabaSubscribed: false,
			phoneFound: false,
			phoneConnected: false,
			phoneCloudApi: false,
			ownerBusinessVerified: false,
			hasAssignedManager: false,
		};

		if (!token) {
			issues.push("token_missing");
			actions.push("reauth");
		} else {
			const appAccessToken = `${appId}|${appSecret}`;
			const debugRes = await fetch(
				`https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appAccessToken)}`,
			);
			const debug = (await debugRes.json()) as DebugTokenResponse;
			const debugData = debug.data;

			checks.tokenValid = debugData?.is_valid === true;
			if (!checks.tokenValid) {
				issues.push("token_invalid");
				actions.push("reauth");
			}

			const scopes = new Set(debugData?.scopes ?? []);
			checks.hasRequiredScopes =
				scopes.has("business_management") &&
				scopes.has("whatsapp_business_management") &&
				scopes.has("whatsapp_business_messaging");
			if (!checks.hasRequiredScopes) {
				issues.push("missing_required_scopes");
				actions.push("reauth");
			}

			const targetIds =
				debugData?.granular_scopes
					?.filter((s) => s.scope === "whatsapp_business_management")
					.flatMap((s) => s.target_ids ?? []) ?? [];
			checks.hasWabaTarget = targetIds.includes(account.wabaId);
			if (!checks.hasWabaTarget) {
				issues.push("missing_waba_target");
				actions.push("reauth");
			}

			const appSubscriptions = await metaFetch<{
				data?: Array<{
					object?: string;
					active?: boolean;
					callback_url?: string;
					fields?: Array<{ name?: string }>;
				}>;
			}>(`${appId}/subscriptions`, appAccessToken, { tokenInBody: false });

			const appSub = (appSubscriptions.data ?? []).find(
				(sub) => sub.object === "whatsapp_business_account",
			);
			const hasMessagesField = (appSub?.fields ?? []).some(
				(f) => f.name === "messages",
			);
			checks.appWebhookActive =
				appSub?.active === true &&
				appSub.callback_url === callbackUrl &&
				hasMessagesField;
			if (!checks.appWebhookActive) {
				issues.push("app_webhook_inactive");
				actions.push("repair_subscriptions");
			}

			const subscribedApps = await metaFetch<{
				data?: Array<{ whatsapp_business_api_data?: { id?: string } }>;
			}>(`${account.wabaId}/subscribed_apps`, token, { tokenInBody: false });
			checks.wabaSubscribed = (subscribedApps.data ?? []).some(
				(row) => row.whatsapp_business_api_data?.id === appId,
			);
			if (!checks.wabaSubscribed) {
				issues.push("waba_not_subscribed");
				actions.push("repair_subscriptions");
			}

			const wabaDetails = await metaFetch<{
				owner_business_info?: { id?: string };
				business_verification_status?: string;
			}>(
				`${account.wabaId}?fields=owner_business_info,business_verification_status`,
				token,
				{ tokenInBody: false },
			);
			checks.ownerBusinessVerified =
				wabaDetails.business_verification_status === "verified";
			if (!checks.ownerBusinessVerified) {
				issues.push("owner_business_unverified");
				actions.push("check_business_verification");
			}

			const phoneNumbers = await metaFetch<MetaListResponse<MetaPhoneNumber>>(
				`${account.wabaId}/phone_numbers?fields=id,status,platform_type`,
				token,
				{ tokenInBody: false },
			);
			const phone = (phoneNumbers.data ?? []).find(
				(p) => p.id === account.phoneNumberId,
			);
			checks.phoneFound = !!phone;
			checks.phoneConnected = phone?.status === "CONNECTED";
			checks.phoneCloudApi = phone?.platform_type === "CLOUD_API";

			if (!checks.phoneFound) issues.push("phone_not_found");
			if (checks.phoneFound && !checks.phoneConnected)
				issues.push("phone_not_connected");
			if (checks.phoneFound && !checks.phoneCloudApi)
				issues.push("phone_not_cloud_api");

			if (
				!checks.phoneFound ||
				!checks.phoneConnected ||
				!checks.phoneCloudApi
			) {
				actions.push("wait_and_retry");
			}

			const ownerBusinessId = wabaDetails.owner_business_info?.id;
			if (ownerBusinessId) {
				const assignedUsers = await metaFetch<
					MetaListResponse<{ tasks?: string[] }>
				>(
					`${account.wabaId}/assigned_users?business=${ownerBusinessId}&fields=id,name,tasks`,
					token,
					{ tokenInBody: false },
				);

				checks.hasAssignedManager = (assignedUsers.data ?? []).some((u) =>
					(u.tasks ?? []).includes("MANAGE"),
				);
				if (!checks.hasAssignedManager) {
					issues.push("assigned_user_missing_manage");
					actions.push("check_asset_tasks");
				}
			}
		}

		const dedupedIssues = [...new Set(issues)];
		const dedupedActions = [...new Set(actions)];
		const { status, summary } = summarizeHealth(dedupedIssues, dedupedActions);

		await ctx.runMutation(internal.accounts.updateConnectionHealth, {
			accountId,
			status,
			checkedAt: Date.now(),
			issues: dedupedIssues,
			actions: dedupedActions,
			summary,
			checks,
		});

		return {
			status,
			issues: dedupedIssues,
			actions: dedupedActions,
			summary,
			checks,
		};
	},
});

/**
 * Retryable repair flow for Meta subscriptions, then re-run health checks.
 */
export const repairConnectionSubscriptions = action({
	args: { accountId: v.id("accounts") },
	handler: async (ctx, { accountId }): Promise<{ success: boolean }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Not authenticated");

		const hasAccess = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId,
			userId,
		});
		if (!hasAccess) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId,
		});
		if (!account) throw new Error("Account not found");

		const token = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId },
		);
		if (!token)
			throw new Error("No Facebook token found. Please sign in again.");

		const appId = process.env.FACEBOOK_APP_ID;
		if (!appId) throw new Error("Missing env var: FACEBOOK_APP_ID");

		try {
			await metaFetch<{ success: boolean }>(
				`${account.wabaId}/subscribed_apps`,
				token,
				{
					method: "DELETE",
					body: { app_id: appId },
					tokenInBody: true,
				},
			);
		} catch {
			// Best-effort cleanup before re-subscribe.
		}

		await metaFetch<{ success: boolean }>(
			`${account.wabaId}/subscribed_apps`,
			token,
			{
				method: "POST",
				body: {},
				tokenInBody: true,
			},
		);

		const appSecret = process.env.FACEBOOK_APP_SECRET;
		const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
		const callbackUrl = process.env.WEBHOOK_CALLBACK_URL;
		if (!appId || !appSecret || !verifyToken || !callbackUrl) {
			throw new Error(
				"Missing env vars: FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, WEBHOOK_VERIFY_TOKEN, or WEBHOOK_CALLBACK_URL",
			);
		}

		const appAccessToken = `${appId}|${appSecret}`;
		await metaFetch<{ success: boolean }>(
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

		return { success: true };
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
