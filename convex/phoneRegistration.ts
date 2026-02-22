/**
 * Phone registration workflow — Meta API actions for adding and verifying
 * phone numbers on a WhatsApp Business Account.
 *
 * Flow: addPhoneToWaba → requestCode → submitCode → registerNumber
 *
 * Each action:
 * 1. Reads the account to get current state + credentials
 * 2. Calls the Meta API
 * 3. Transitions the account to the next state (or failed)
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { auth } from "./auth";
import { metaFetch } from "./metaFetch";

// ── Helpers ──

// biome-ignore lint/suspicious/noExplicitAny: Convex action ctx type is complex
async function getFacebookToken(ctx: any, userId: string): Promise<string> {
	const token: string | null = await ctx.runQuery(
		internal.whatsappDiscovery.getFacebookToken,
		{ userId },
	);
	if (!token) throw new Error("No Facebook token found. Please sign in again.");
	return token;
}

// ============================================================================
// STEP 1: Add phone number to WABA
// ============================================================================

/**
 * Add a phone number to a WhatsApp Business Account via Meta API.
 * Transitions: adding_number → code_requested
 *
 * Meta API: POST /{waba_id}/phone_numbers
 */
export const addPhoneToWaba = action({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args): Promise<{ phoneNumberId: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (account.status !== "adding_number") {
			throw new Error(`Cannot add phone in status: ${account.status}`);
		}

		const token = await getFacebookToken(ctx, userId);

		try {
			// Meta wants phone_number WITHOUT country code or "+" prefix.
			// e.g. for "+18302228750" with cc "1" → phone_number "8302228750"
			const rawDigits = account.phoneNumber.replace(/^\+/, "");
			const nationalNumber =
				account.countryCode && rawDigits.startsWith(account.countryCode)
					? rawDigits.slice(account.countryCode.length)
					: rawDigits;

			const data = await metaFetch<{ id: string }>(
				`${account.wabaId}/phone_numbers`,
				token,
				{
					method: "POST",
					body: {
						cc: account.countryCode,
						phone_number: nationalNumber,
						verified_name: account.displayName,
					},
					tokenInBody: true,
				},
			);

			// Now request verification code
			await metaFetch<{ success: boolean }>(`${data.id}/request_code`, token, {
				method: "POST",
				body: {
					code_method: "SMS",
					language: "en_US",
				},
				tokenInBody: true,
			});

			// Transition to code_requested with the new phone number ID
			await ctx.runMutation(internal.accounts.transitionToCodeRequested, {
				accountId: args.accountId,
				phoneNumberId: data.id,
			});

			return { phoneNumberId: data.id };
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Unknown error";

			// Determine which step failed based on error context
			const failedAtStep =
				errorMsg.includes("request_code") || errorMsg.includes("verification")
					? "code_requested"
					: "adding_number";

			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep,
				failedError: errorMsg,
			});
			throw error;
		}
	},
});

// ============================================================================
// STEP 2: Re-request verification code (if user needs a new one)
// ============================================================================

/**
 * Re-request a verification code for a phone number.
 * Only valid when status = "code_requested".
 *
 * Meta API: POST /{phone_number_id}/request_code
 */
export const resendCode = action({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (account.status !== "code_requested") {
			throw new Error(`Cannot resend code in status: ${account.status}`);
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set — cannot resend code");
		}

		const token = await getFacebookToken(ctx, userId);

		await metaFetch<{ success: boolean }>(
			`${account.phoneNumberId}/request_code`,
			token,
			{
				method: "POST",
				body: {
					code_method: "SMS",
					language: "en_US",
				},
				tokenInBody: true,
			},
		);

		return { success: true };
	},
});

// ============================================================================
// STEP 3: Submit verification code
// ============================================================================

/**
 * Submit the 6-digit OTP code to Meta for verification.
 * Transitions: code_requested → verifying_code → registering
 *
 * Meta API: POST /{phone_number_id}/verify_code
 */
export const submitCode = action({
	args: {
		accountId: v.id("accounts"),
		code: v.string(), // 6-digit OTP
		twoStepPin: v.string(), // 6-digit 2FA pin (user chooses this)
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (account.status !== "code_requested") {
			throw new Error(`Cannot submit code in status: ${account.status}`);
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set");
		}

		const token = await getFacebookToken(ctx, userId);

		// Transition to verifying_code
		await ctx.runMutation(internal.accounts.transitionToVerifyingCode, {
			accountId: args.accountId,
			verificationCode: args.code,
		});

		try {
			// Verify the code
			await metaFetch<{ success: boolean }>(
				`${account.phoneNumberId}/verify_code`,
				token,
				{
					method: "POST",
					body: { code: args.code },
					tokenInBody: true,
				},
			);

			// Code verified — now register the number
			await ctx.runMutation(internal.accounts.transitionToRegistering, {
				accountId: args.accountId,
				twoStepPin: args.twoStepPin,
			});

			await metaFetch<{ success: boolean }>(
				`${account.phoneNumberId}/register`,
				token,
				{
					method: "POST",
					body: {
						messaging_product: "whatsapp",
						pin: args.twoStepPin,
					},
					tokenInBody: true,
				},
			);

			// Registration successful — transition to pending_name_review
			await ctx.runMutation(internal.accounts.transitionToPendingNameReview, {
				accountId: args.accountId,
			});

			// Start name review polling
			await ctx.scheduler.runAfter(
				60 * 60 * 1000, // 1 hour
				internal.nameReview.checkNameStatus,
				{ accountId: args.accountId },
			);

			return { success: true };
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : "Unknown error";

			// Determine which step failed
			const failedAtStep =
				errorMsg.includes("Registration") || errorMsg.includes("register")
					? "registering"
					: "verifying_code";

			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep,
				failedError: errorMsg,
			});
			throw error;
		}
	},
});

// ============================================================================
// AUTO-VERIFY (for Twilio path — called from SMS webhook)
// ============================================================================

/**
 * Automatically verify and register a phone number using an auto-captured OTP.
 * Called internally after the Twilio SMS webhook captures the verification code.
 * Transitions: code_requested → verifying_code → registering → pending_name_review
 *
 * Security: Requires authentication + account membership to prevent
 * unauthenticated callers from hijacking the registration flow.
 */
export const autoVerifyAndRegister = action({
	args: {
		accountId: v.id("accounts"),
		twoStepPin: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (account.status !== "code_requested") {
			throw new Error(`Cannot auto-verify in status: ${account.status}`);
		}
		if (!account.verificationCode) {
			throw new Error("No verification code captured yet");
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set");
		}

		// Get token from owner's Facebook token
		const fbToken: string | null = await ctx.runQuery(
			internal.whatsappDiscovery.getFacebookToken,
			{ userId: account.ownerId },
		);
		if (!fbToken) throw new Error("No Facebook token for account owner");
		const token = fbToken;

		// Transition to verifying_code
		await ctx.runMutation(internal.accounts.transitionToVerifyingCode, {
			accountId: args.accountId,
			verificationCode: account.verificationCode,
		});

		try {
			// Verify the code
			await metaFetch<{ success: boolean }>(
				`${account.phoneNumberId}/verify_code`,
				token,
				{
					method: "POST",
					body: { code: account.verificationCode },
					tokenInBody: true,
				},
			);

			// Register the number
			await ctx.runMutation(internal.accounts.transitionToRegistering, {
				accountId: args.accountId,
				twoStepPin: args.twoStepPin,
			});

			await metaFetch<{ success: boolean }>(
				`${account.phoneNumberId}/register`,
				token,
				{
					method: "POST",
					body: {
						messaging_product: "whatsapp",
						pin: args.twoStepPin,
					},
					tokenInBody: true,
				},
			);

			// Transition to pending_name_review
			await ctx.runMutation(internal.accounts.transitionToPendingNameReview, {
				accountId: args.accountId,
			});

			// Start name review polling
			await ctx.scheduler.runAfter(
				60 * 60 * 1000,
				internal.nameReview.checkNameStatus,
				{ accountId: args.accountId },
			);

			return { success: true };
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : "Unknown error";
			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep: "verifying_code",
				failedError: errorMsg,
			});
			return { success: false, error: errorMsg };
		}
	},
});

// ============================================================================
// REGISTER EXISTING NUMBER (already on WABA, not registered with Cloud API)
// ============================================================================

/**
 * Register a phone number that already exists on the WABA but hasn't been
 * registered with the Cloud API yet. This is the missing step when a user
 * picks an "existing" number during setup.
 *
 * Transitions: registering → pending_name_review
 *
 * Meta API: POST /{phone_number_id}/register
 */
export const registerExistingNumber = action({
	args: {
		accountId: v.id("accounts"),
		twoStepPin: v.string(), // 6-digit 2FA pin
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (account.status !== "registering") {
			throw new Error(
				`Cannot register in status: ${account.status}. Expected "registering".`,
			);
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set");
		}

		const token = await getFacebookToken(ctx, userId);

		// Store the PIN
		await ctx.runMutation(internal.accounts.transitionToRegistering, {
			accountId: args.accountId,
			twoStepPin: args.twoStepPin,
		});

		// Call Meta's /register endpoint
		await metaFetch<{ success: boolean }>(
			`${account.phoneNumberId}/register`,
			token,
			{
				method: "POST",
				body: {
					messaging_product: "whatsapp",
					pin: args.twoStepPin,
				},
				tokenInBody: true,
			},
		);

		// Query the number's status to confirm registration took effect
		try {
			const statusBody = await metaFetch<Record<string, unknown>>(
				`${account.phoneNumberId}?fields=id,status,name_status,code_verification_status,platform_type`,
				token,
			);
			console.log(
				"registerExistingNumber: phone status after register:",
				JSON.stringify(statusBody),
			);
		} catch {
			// Non-critical — just for logging
		}

		// Registration successful — transition to pending_name_review
		await ctx.runMutation(internal.accounts.transitionToPendingNameReview, {
			accountId: args.accountId,
		});

		// Start name review polling
		await ctx.scheduler.runAfter(
			60 * 60 * 1000, // 1 hour
			internal.nameReview.checkNameStatus,
			{ accountId: args.accountId },
		);

		return { success: true };
	},
});

// ============================================================================
// DIAGNOSTIC: Check phone number status on Meta (no mutations)
// ============================================================================

/**
 * Query Meta API for the current status of a phone number.
 * Useful for debugging registration issues. Read-only — no state changes.
 */
export const checkPhoneStatus = action({
	args: {
		accountId: v.id("accounts"),
	},
	handler: async (ctx, args): Promise<Record<string, unknown>> => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error("Unauthorized");

		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");

		const isMember = await ctx.runQuery(internal.accounts.checkMembership, {
			accountId: args.accountId,
			userId,
		});
		if (!isMember) throw new Error("Unauthorized");

		if (!account.phoneNumberId) throw new Error("No phoneNumberId on account");

		const token = await getFacebookToken(ctx, userId);

		const data = await metaFetch<Record<string, unknown>>(
			`${account.phoneNumberId}?fields=id,display_phone_number,verified_name,status,name_status,code_verification_status,platform_type,quality_rating,messaging_limit_tier,is_official_business_account`,
			token,
		);
		console.log("checkPhoneStatus:", JSON.stringify(data));
		return data;
	},
});
