/**
 * Twilio Connect integration — manage Twilio subaccounts, search/buy phone numbers.
 *
 * Flow:
 * 1. User clicks "Buy via Twilio Connect" → redirected to Twilio OAuth
 * 2. Twilio redirects back with AccountSid → saved as twilioConnection
 * 3. User searches for available numbers in their country
 * 4. User picks a number → we buy it via Twilio API
 * 5. Number is used in the BYON registration flow (adding_number → ... → active)
 *
 * Environment variables (set in Convex dashboard):
 *   TWILIO_CONNECT_APP_SID — the Connect App SID (starts with CN...)
 *   TWILIO_CONNECT_APP_SECRET — the Connect App secret (for deauthorize signature)
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, mutation, query } from "./_generated/server";
import { auth } from "./auth";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

// ── Helpers ──

function twilioAuthHeader(accountSid: string, authToken: string): string {
	const encoded = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
	return `Basic ${encoded}`;
}

// ============================================================================
// QUERIES
// ============================================================================

/** List the current user's Twilio Connect connections */
export const listConnections = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		const connections = await ctx.db
			.query("twilioConnections")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		return connections.filter((c) => c.status === "active");
	},
});

/** Get a connection by ID (internal) */
export const getConnectionInternal = internalQuery({
	args: { connectionId: v.id("twilioConnections") },
	handler: async (ctx, args) => {
		return ctx.db.get(args.connectionId);
	},
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Save a new Twilio Connect connection after OAuth redirect.
 * Called from the /api/twilio/authorize route after Twilio redirects back.
 */
export const saveConnection = mutation({
	args: {
		subaccountSid: v.string(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		// Check if connection already exists
		const existing = await ctx.db
			.query("twilioConnections")
			.withIndex("by_subaccount_sid", (q) =>
				q.eq("subaccountSid", args.subaccountSid),
			)
			.first();

		if (existing) {
			// Reactivate if deauthorized
			if (existing.status === "deauthorized") {
				await ctx.db.patch(existing._id, {
					status: "active",
					deauthorizedAt: undefined,
				});
			}
			return existing._id;
		}

		return ctx.db.insert("twilioConnections", {
			userId,
			subaccountSid: args.subaccountSid,
			status: "active",
			connectedAt: Date.now(),
		});
	},
});

/**
 * Mark a Twilio Connect connection as deauthorized.
 * Called from the /api/twilio/deauthorize webhook (public — uses ConvexHttpClient).
 */
export const deauthorizeConnection = mutation({
	args: {
		subaccountSid: v.string(),
	},
	handler: async (ctx, args) => {
		const connection = await ctx.db
			.query("twilioConnections")
			.withIndex("by_subaccount_sid", (q) =>
				q.eq("subaccountSid", args.subaccountSid),
			)
			.first();

		if (!connection) return;

		await ctx.db.patch(connection._id, {
			status: "deauthorized",
			deauthorizedAt: Date.now(),
		});
	},
});

// ============================================================================
// ACTIONS — Twilio API calls
// ============================================================================

type AvailableNumber = {
	phoneNumber: string; // E.164: "+14155552671"
	friendlyName: string; // "(415) 555-2671"
	locality: string;
	region: string;
	isoCountry: string;
	capabilities: {
		sms: boolean;
		mms: boolean;
		voice: boolean;
	};
};

/**
 * Search for available phone numbers in a country via the Twilio subaccount.
 * Requires the subaccount's auth token (fetched via master account).
 */
export const searchNumbers = action({
	args: {
		connectionId: v.id("twilioConnections"),
		countryCode: v.string(), // ISO 3166-1 alpha-2: "US", "DE", "GB"
		areaCode: v.optional(v.string()),
		contains: v.optional(v.string()), // Number pattern to match
		smsEnabled: v.optional(v.boolean()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args): Promise<AvailableNumber[]> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const connection = await ctx.runQuery(
			internal.twilioConnect.getConnectionInternal,
			{ connectionId: args.connectionId },
		);
		if (!connection || connection.status !== "active") {
			throw new Error("Twilio connection not found or deauthorized");
		}
		if (connection.userId !== userId) {
			throw new Error("Unauthorized — not your connection");
		}

		const masterSid = process.env.TWILIO_ACCOUNT_SID;
		const masterToken = process.env.TWILIO_AUTH_TOKEN;
		if (!masterSid || !masterToken) {
			throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
		}

		// Build query params
		const params = new URLSearchParams();
		if (args.areaCode) params.set("AreaCode", args.areaCode);
		if (args.contains) params.set("Contains", args.contains);
		if (args.smsEnabled !== false) params.set("SmsEnabled", "true");
		params.set("PageSize", String(args.limit ?? 20));

		// Search using the subaccount
		const url = `${TWILIO_API_BASE}/Accounts/${connection.subaccountSid}/AvailablePhoneNumbers/${args.countryCode}/Local.json?${params}`;
		const res = await fetch(url, {
			headers: {
				Authorization: twilioAuthHeader(masterSid, masterToken),
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
 * Buy a phone number via the Twilio subaccount.
 * Configures the SMS webhook URL so we can auto-capture Meta verification codes.
 */
export const buyNumber = action({
	args: {
		connectionId: v.id("twilioConnections"),
		phoneNumber: v.string(), // E.164: "+14155552671"
	},
	handler: async (
		ctx,
		args,
	): Promise<{ sid: string; phoneNumber: string; friendlyName: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const connection = await ctx.runQuery(
			internal.twilioConnect.getConnectionInternal,
			{ connectionId: args.connectionId },
		);
		if (!connection || connection.status !== "active") {
			throw new Error("Twilio connection not found or deauthorized");
		}
		if (connection.userId !== userId) {
			throw new Error("Unauthorized — not your connection");
		}

		const masterSid = process.env.TWILIO_ACCOUNT_SID;
		const masterToken = process.env.TWILIO_AUTH_TOKEN;
		const smsWebhookUrl = process.env.TWILIO_SMS_WEBHOOK_URL;
		if (!masterSid || !masterToken) {
			throw new Error("Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN");
		}

		// Buy the number on the subaccount
		const params = new URLSearchParams();
		params.set("PhoneNumber", args.phoneNumber);
		// Set SMS webhook for OTP auto-capture
		if (smsWebhookUrl) {
			params.set("SmsUrl", smsWebhookUrl);
			params.set("SmsMethod", "POST");
		}

		const url = `${TWILIO_API_BASE}/Accounts/${connection.subaccountSid}/IncomingPhoneNumbers.json`;
		const res = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: twilioAuthHeader(masterSid, masterToken),
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
 * stores the code, and triggers auto-verification.
 *
 * Called from /api/twilio/sms webhook (public action via ConvexHttpClient).
 */
export const captureVerificationCode = action({
	args: {
		phoneNumber: v.string(), // E.164: "+14155552671"
		code: v.string(), // 6-digit code
	},
	handler: async (ctx, args): Promise<{ captured: boolean }> => {
		// Find accounts with this phone number in code_requested state
		// We search by phoneNumber field since that's set at creation
		const accounts = await ctx.runQuery(
			internal.twilioConnect.findAccountByPhoneNumber,
			{ phoneNumber: args.phoneNumber },
		);

		if (!accounts) {
			console.log(
				`[captureVerificationCode] No account found for ${args.phoneNumber}`,
			);
			return { captured: false };
		}

		// Store the verification code
		await ctx.runMutation(internal.accounts.storeVerificationCode, {
			accountId: accounts._id,
			verificationCode: args.code,
		});

		// Trigger auto-verification if the account has a twoStepPin
		// (it won't — the user needs to provide it, so we just store the code
		// and let the UI notice it's available via reactive query)
		return { captured: true };
	},
});

/** Find an account by phone number that's waiting for a code (internal) */
export const findAccountByPhoneNumber = internalQuery({
	args: { phoneNumber: v.string() },
	handler: async (ctx, args) => {
		// Look for accounts with this phone number in code_requested state
		const accounts = await ctx.db
			.query("accounts")
			.withIndex("by_status", (q) => q.eq("status", "code_requested"))
			.collect();

		return accounts.find((a) => a.phoneNumber === args.phoneNumber) ?? null;
	},
});
