/**
 * Twilio integration — user provides their own Account SID + Auth Token.
 * We use their credentials to list existing numbers, search, and buy new ones.
 *
 * Flow:
 * 1. User pastes their Twilio Account SID + Auth Token
 * 2. We validate the credentials and save them
 * 3. User can list their existing Twilio numbers or search/buy new ones
 * 4. Selected number goes through the BYON registration flow (adding_number → ... → active)
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { auth } from "./auth";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

// ── Helpers ──

function twilioAuthHeader(accountSid: string, authToken: string): string {
	const encoded = btoa(`${accountSid}:${authToken}`);
	return `Basic ${encoded}`;
}

// ============================================================================
// QUERIES
// ============================================================================

/** Get the current user's saved Twilio credentials (if any) */
export const getCredentials = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return null;

		const creds = await ctx.db
			.query("twilioCredentials")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();

		if (!creds) return null;

		// Return with masked token for display
		return {
			_id: creds._id,
			accountSid: creds.accountSid,
			authTokenMasked: `${creds.authToken.slice(0, 4)}...${creds.authToken.slice(-4)}`,
			friendlyName: creds.friendlyName,
			savedAt: creds.savedAt,
		};
	},
});

/** Get credentials by ID (internal — includes raw auth token) */
export const getCredentialsInternal = internalQuery({
	args: { credentialsId: v.id("twilioCredentials") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.credentialsId);
	},
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Save Twilio credentials after validation.
 * If the user already has saved credentials, update them.
 */
export const saveCredentials = mutation({
	args: {
		accountSid: v.string(),
		authToken: v.string(),
		friendlyName: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Check if credentials already exist for this user
		const existing = await ctx.db
			.query("twilioCredentials")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				accountSid: args.accountSid,
				authToken: args.authToken,
				friendlyName: args.friendlyName,
				savedAt: Date.now(),
			});
			return existing._id;
		}

		return ctx.db.insert("twilioCredentials", {
			userId,
			accountSid: args.accountSid,
			authToken: args.authToken,
			friendlyName: args.friendlyName,
			savedAt: Date.now(),
		});
	},
});

// ============================================================================
// ACTIONS — Twilio API calls
// ============================================================================

type TwilioAvailableCountry = {
	countryCode: string; // ISO 3166-1 alpha-2: "US", "DE"
	country: string; // "United States", "Germany"
};

type TwilioOwnedNumber = {
	sid: string; // PN...
	phoneNumber: string; // E.164: "+14155552671"
	friendlyName: string; // "(415) 555-2671"
	capabilities: { sms: boolean; mms: boolean; voice: boolean };
};

type AvailableNumber = {
	phoneNumber: string;
	friendlyName: string;
	locality: string;
	region: string;
	isoCountry: string;
	capabilities: { sms: boolean; mms: boolean; voice: boolean };
};

/**
 * Validate Twilio credentials and return account info.
 * Called before saving to verify they work.
 */
export const validateCredentials = action({
	args: {
		accountSid: v.string(),
		authToken: v.string(),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ valid: boolean; friendlyName?: string; error?: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const res = await fetch(
			`${TWILIO_API_BASE}/Accounts/${args.accountSid}.json`,
			{
				headers: {
					Authorization: twilioAuthHeader(args.accountSid, args.authToken),
				},
			},
		);

		if (!res.ok) {
			if (res.status === 401) {
				return { valid: false, error: "Invalid Account SID or Auth Token" };
			}
			return {
				valid: false,
				error: `Twilio returned ${res.status}: ${res.statusText}`,
			};
		}

		const data = (await res.json()) as { friendly_name?: string };
		return { valid: true, friendlyName: data.friendly_name };
	},
});

/**
 * List countries where Twilio has available phone numbers.
 */
export const listAvailableCountries = action({
	args: {
		credentialsId: v.id("twilioCredentials"),
	},
	handler: async (ctx, args): Promise<TwilioAvailableCountry[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const creds = await ctx.runQuery(
			internal.twilioConnect.getCredentialsInternal,
			{ credentialsId: args.credentialsId },
		);
		if (!creds) throw new Error("Twilio credentials not found");
		if (creds.userId !== userId) throw new Error("Unauthorized");

		const res = await fetch(
			`${TWILIO_API_BASE}/Accounts/${creds.accountSid}/AvailablePhoneNumbers.json?PageSize=300`,
			{
				headers: {
					Authorization: twilioAuthHeader(creds.accountSid, creds.authToken),
				},
			},
		);

		if (!res.ok) {
			const body = await res.text();
			throw new Error(
				`Failed to list Twilio countries (${res.status}): ${body}`,
			);
		}

		const data = (await res.json()) as {
			countries: Array<{
				country_code: string;
				country: string;
			}>;
		};

		return (data.countries ?? []).map((c) => ({
			countryCode: c.country_code,
			country: c.country,
		}));
	},
});

/**
 * List existing phone numbers on the user's Twilio account.
 */
export const listExistingNumbers = action({
	args: {
		credentialsId: v.id("twilioCredentials"),
	},
	handler: async (ctx, args): Promise<TwilioOwnedNumber[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const creds = await ctx.runQuery(
			internal.twilioConnect.getCredentialsInternal,
			{ credentialsId: args.credentialsId },
		);
		if (!creds) throw new Error("Twilio credentials not found");
		if (creds.userId !== userId) throw new Error("Unauthorized");

		const res = await fetch(
			`${TWILIO_API_BASE}/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json?PageSize=50`,
			{
				headers: {
					Authorization: twilioAuthHeader(creds.accountSid, creds.authToken),
				},
			},
		);

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Failed to list Twilio numbers (${res.status}): ${body}`);
		}

		const data = (await res.json()) as {
			incoming_phone_numbers: Array<{
				sid: string;
				phone_number: string;
				friendly_name: string;
				capabilities: { sms: boolean; mms: boolean; voice: boolean };
			}>;
		};

		return (data.incoming_phone_numbers ?? []).map((n) => ({
			sid: n.sid,
			phoneNumber: n.phone_number,
			friendlyName: n.friendly_name,
			capabilities: n.capabilities,
		}));
	},
});

/**
 * Search for available phone numbers in a country.
 */
export const searchNumbers = action({
	args: {
		credentialsId: v.id("twilioCredentials"),
		countryCode: v.string(), // ISO 3166-1 alpha-2: "US", "DE", "GB"
		areaCode: v.optional(v.string()),
		smsEnabled: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<AvailableNumber[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const creds = await ctx.runQuery(
			internal.twilioConnect.getCredentialsInternal,
			{ credentialsId: args.credentialsId },
		);
		if (!creds) throw new Error("Twilio credentials not found");
		if (creds.userId !== userId) throw new Error("Unauthorized");

		const params = new URLSearchParams();
		if (args.areaCode) params.set("AreaCode", args.areaCode);
		if (args.smsEnabled !== false) params.set("SmsEnabled", "true");
		params.set("PageSize", String(args.limit ?? 20));

		const url = `${TWILIO_API_BASE}/Accounts/${creds.accountSid}/AvailablePhoneNumbers/${args.countryCode}/Local.json?${params}`;
		const res = await fetch(url, {
			headers: {
				Authorization: twilioAuthHeader(creds.accountSid, creds.authToken),
			},
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Twilio search failed (${res.status}): ${body}`);
		}

		const data = (await res.json()) as {
			available_phone_numbers: Array<{
				phone_number: string;
				friendly_name: string;
				locality: string;
				region: string;
				iso_country: string;
				capabilities: { sms: boolean; mms: boolean; voice: boolean };
			}>;
		};

		return (data.available_phone_numbers ?? []).map((n) => ({
			phoneNumber: n.phone_number,
			friendlyName: n.friendly_name,
			locality: n.locality,
			region: n.region,
			isoCountry: n.iso_country,
			capabilities: n.capabilities,
		}));
	},
});

/**
 * Buy a phone number on the user's Twilio account.
 * Configures the SMS webhook URL so we can auto-capture Meta verification codes.
 */
export const buyNumber = action({
	args: {
		credentialsId: v.id("twilioCredentials"),
		phoneNumber: v.string(), // E.164: "+14155552671"
	},
	handler: async (
		ctx,
		args,
	): Promise<{ sid: string; phoneNumber: string; friendlyName: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const creds = await ctx.runQuery(
			internal.twilioConnect.getCredentialsInternal,
			{ credentialsId: args.credentialsId },
		);
		if (!creds) throw new Error("Twilio credentials not found");
		if (creds.userId !== userId) throw new Error("Unauthorized");

		const smsWebhookUrl = process.env.TWILIO_SMS_WEBHOOK_URL;

		const params = new URLSearchParams();
		params.set("PhoneNumber", args.phoneNumber);
		if (smsWebhookUrl) {
			params.set("SmsUrl", smsWebhookUrl);
			params.set("SmsMethod", "POST");
		}

		const url = `${TWILIO_API_BASE}/Accounts/${creds.accountSid}/IncomingPhoneNumbers.json`;
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: twilioAuthHeader(creds.accountSid, creds.authToken),
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		});

		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Twilio buy failed (${res.status}): ${body}`);
		}

		const data = (await res.json()) as {
			sid: string;
			phone_number: string;
			friendly_name: string;
		};

		return {
			sid: data.sid,
			phoneNumber: data.phone_number,
			friendlyName: data.friendly_name,
		};
	},
});

// ============================================================================
// OTP AUTO-CAPTURE (called from SMS webhook)
// ============================================================================

/**
 * Capture a Meta verification code from an incoming SMS on a Twilio number.
 * Finds the account in code_requested state that owns this phone number,
 * stores the code.
 *
 * Called from /api/twilio/sms webhook (public action via ConvexHttpClient).
 */
export const captureVerificationCode = action({
	args: {
		phoneNumber: v.string(),
		code: v.string(),
	},
	handler: async (ctx, args): Promise<{ captured: boolean }> => {
		const account = await ctx.runQuery(
			internal.twilioConnect.findAccountByPhoneNumber,
			{ phoneNumber: args.phoneNumber },
		);

		if (!account) {
			console.log(
				`[captureVerificationCode] No account found for ${args.phoneNumber}`,
			);
			return { captured: false };
		}

		await ctx.runMutation(internal.accounts.storeVerificationCode, {
			accountId: account._id,
			verificationCode: args.code,
		});

		return { captured: true };
	},
});

/** Find an account by phone number that's waiting for a code (internal) */
export const findAccountByPhoneNumber = internalQuery({
	args: { phoneNumber: v.string() },
	handler: async (ctx, args) => {
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_status", (q) => q.eq("status", "code_requested"))
			.collect();

		return accounts.find((a) => a.phoneNumber === args.phoneNumber) ?? null;
	},
});
