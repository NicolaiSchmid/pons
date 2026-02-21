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

const META_API_VERSION = "v22.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

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

		if (account.status !== "adding_number") {
			throw new Error(`Cannot add phone in status: ${account.status}`);
		}

		const fbToken = await getFacebookToken(ctx, userId);
		const token = fbToken;

		try {
			// Meta wants phone_number WITHOUT country code or "+" prefix.
			// e.g. for "+18302228750" with cc "1" → phone_number "8302228750"
			const rawDigits = account.phoneNumber.replace(/^\+/, "");
			const nationalNumber =
				account.countryCode && rawDigits.startsWith(account.countryCode)
					? rawDigits.slice(account.countryCode.length)
					: rawDigits;

			const res = await fetch(
				`${META_API_BASE}/${account.wabaId}/phone_numbers`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						cc: account.countryCode,
						phone_number: nationalNumber,
						verified_name: account.displayName,
						access_token: token,
					}),
				},
			);

			if (!res.ok) {
				const error = await res.json();
				const errorMsg =
					error.error?.message ?? `HTTP ${res.status}: ${res.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "adding_number",
					failedError: errorMsg,
				});
				throw new Error(`Failed to add phone number: ${errorMsg}`);
			}

			const data = (await res.json()) as { id: string };

			// Now request verification code
			const codeRes = await fetch(`${META_API_BASE}/${data.id}/request_code`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code_method: "SMS",
					language: "en_US",
					access_token: token,
				}),
			});

			if (!codeRes.ok) {
				const error = await codeRes.json();
				const errorMsg =
					error.error?.message ??
					`HTTP ${codeRes.status}: ${codeRes.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "code_requested",
					failedError: errorMsg,
				});
				throw new Error(`Failed to request verification code: ${errorMsg}`);
			}

			// Transition to code_requested with the new phone number ID
			await ctx.runMutation(internal.accounts.transitionToCodeRequested, {
				accountId: args.accountId,
				phoneNumberId: data.id,
			});

			return { phoneNumberId: data.id };
		} catch (error) {
			// If it's already been transitioned to failed, just re-throw
			if (error instanceof Error && error.message.startsWith("Failed to")) {
				throw error;
			}
			// Unexpected error
			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep: "adding_number",
				failedError: error instanceof Error ? error.message : "Unknown error",
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
		if (account.status !== "code_requested") {
			throw new Error(`Cannot resend code in status: ${account.status}`);
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set — cannot resend code");
		}

		const fbToken = await getFacebookToken(ctx, userId);
		const token = fbToken;

		const res = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/request_code`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code_method: "SMS",
					language: "en_US",
					access_token: token,
				}),
			},
		);

		if (!res.ok) {
			const error = await res.json();
			throw new Error(
				`Failed to resend code: ${error.error?.message ?? res.statusText}`,
			);
		}

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
		if (account.status !== "code_requested") {
			throw new Error(`Cannot submit code in status: ${account.status}`);
		}
		if (!account.phoneNumberId) {
			throw new Error("Phone number ID not set");
		}

		const fbToken = await getFacebookToken(ctx, userId);
		const token = fbToken;

		// Transition to verifying_code
		await ctx.runMutation(internal.accounts.transitionToVerifyingCode, {
			accountId: args.accountId,
			verificationCode: args.code,
		});

		try {
			// Verify the code
			const res = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/verify_code`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code: args.code,
						access_token: token,
					}),
				},
			);

			if (!res.ok) {
				const error = await res.json();
				const errorMsg =
					error.error?.message ?? `HTTP ${res.status}: ${res.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "verifying_code",
					failedError: errorMsg,
				});
				throw new Error(`Verification failed: ${errorMsg}`);
			}

			// Code verified — now register the number
			await ctx.runMutation(internal.accounts.transitionToRegistering, {
				accountId: args.accountId,
				twoStepPin: args.twoStepPin,
			});

			const regRes = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/register`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messaging_product: "whatsapp",
						pin: args.twoStepPin,
						access_token: token,
					}),
				},
			);

			if (!regRes.ok) {
				const error = await regRes.json();
				const errorMsg =
					error.error?.message ?? `HTTP ${regRes.status}: ${regRes.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "registering",
					failedError: errorMsg,
				});
				throw new Error(`Registration failed: ${errorMsg}`);
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
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.startsWith("Verification failed") ||
					error.message.startsWith("Registration failed"))
			) {
				throw error;
			}
			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep: "verifying_code",
				failedError: error instanceof Error ? error.message : "Unknown error",
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
 */
export const autoVerifyAndRegister = action({
	args: {
		accountId: v.id("accounts"),
		twoStepPin: v.string(),
	},
	handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
		const account = await ctx.runQuery(internal.accounts.getInternal, {
			accountId: args.accountId,
		});
		if (!account) throw new Error("Account not found");
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
			const verifyRes = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/verify_code`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						code: account.verificationCode,
						access_token: token,
					}),
				},
			);

			if (!verifyRes.ok) {
				const verifyBody = (await verifyRes.json()) as {
					error?: { message?: string };
				};
				const errorMsg: string =
					verifyBody.error?.message ??
					`HTTP ${verifyRes.status}: ${verifyRes.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "verifying_code",
					failedError: errorMsg,
				});
				return { success: false, error: errorMsg };
			}

			// Register the number
			await ctx.runMutation(internal.accounts.transitionToRegistering, {
				accountId: args.accountId,
				twoStepPin: args.twoStepPin,
			});

			const regRes = await fetch(
				`${META_API_BASE}/${account.phoneNumberId}/register`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						messaging_product: "whatsapp",
						pin: args.twoStepPin,
						access_token: token,
					}),
				},
			);

			if (!regRes.ok) {
				const regBody = (await regRes.json()) as {
					error?: { message?: string };
				};
				const errorMsg: string =
					regBody.error?.message ??
					`HTTP ${regRes.status}: ${regRes.statusText}`;
				await ctx.runMutation(internal.accounts.transitionToFailed, {
					accountId: args.accountId,
					failedAtStep: "registering",
					failedError: errorMsg,
				});
				return { success: false, error: errorMsg };
			}

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
			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep: "verifying_code",
				failedError: err instanceof Error ? err.message : "Unknown error",
			});
			return {
				success: false,
				error: err instanceof Error ? err.message : "Unknown error",
			};
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
		const regRes = await fetch(
			`${META_API_BASE}/${account.phoneNumberId}/register`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					messaging_product: "whatsapp",
					pin: args.twoStepPin,
					access_token: token,
				}),
			},
		);

		if (!regRes.ok) {
			const error = await regRes.json();
			const errorMsg =
				error.error?.message ?? `HTTP ${regRes.status}: ${regRes.statusText}`;
			await ctx.runMutation(internal.accounts.transitionToFailed, {
				accountId: args.accountId,
				failedAtStep: "registering",
				failedError: errorMsg,
			});
			throw new Error(`Registration failed: ${errorMsg}`);
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
