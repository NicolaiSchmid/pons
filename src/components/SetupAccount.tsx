"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import parsePhoneNumber from "libphonenumber-js";
import {
	AlertCircle,
	ArrowLeft,
	Check,
	ChevronRight,
	ExternalLink,
	Loader2,
	MessageSquare,
	Phone,
	RefreshCw,
	ShoppingCart,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CountryCodeSelector } from "@/components/CountryCodeSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemMedia,
	ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface SetupAccountProps {
	onComplete: () => void;
}

// ── Types ──

type DiscoveredNumber = {
	id: string;
	display_phone_number: string;
	verified_name: string;
	quality_rating: string;
	code_verification_status?: string;
	status?: string;
	platform_type?: string; // "CLOUD_API" | "ON_PREMISE" | "NOT_APPLICABLE"
	businessName: string;
	businessId: string;
	wabaId: string;
	wabaName: string;
};

type TwilioOwnedNumber = {
	sid: string;
	phoneNumber: string;
	friendlyName: string;
	capabilities: { sms: boolean; mms: boolean; voice: boolean };
};

type TwilioAvailableNumber = {
	phoneNumber: string;
	friendlyName: string;
	locality: string;
	region: string;
	isoCountry: string;
	capabilities: { sms: boolean; mms: boolean; voice: boolean };
	numberType: "Local" | "Mobile" | "TollFree";
};

type WizardStep =
	| "pick-number" // Main flat screen: existing numbers + new number options
	| "configure" // Confirm existing number connection
	| "twilio-search" // Browse/search Twilio numbers
	| "twilio-confirm" // Confirm purchase + display name
	| "twilio-verifying" // Auto-verification: PIN entry + waiting for OTP capture
	| "verify-code" // OTP + two-step PIN (BYON only)
	| "complete" // Success
	| "manual"; // Fallback manual form

// ════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export function SetupAccount({ onComplete }: SetupAccountProps) {
	const [mode, setMode] = useState<"loading" | "auto" | "manual">("loading");
	const existingAccounts = useQuery(api.accounts.list);

	const discoverAllNumbers = useAction(
		api.whatsappDiscovery.discoverAllNumbers,
	);

	const [discoveredNumbers, setDiscoveredNumbers] = useState<
		DiscoveredNumber[]
	>([]);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		discoverAllNumbers()
			.then((result) => {
				if (cancelled) return;
				setDiscoveredNumbers(result);
				setMode("auto");
			})
			.catch((err) => {
				if (cancelled) return;
				console.warn("Auto-discovery failed, falling back to manual:", err);
				setDiscoveryError(err instanceof Error ? err.message : String(err));
				setMode("manual");
			});
		return () => {
			cancelled = true;
		};
	}, [discoverAllNumbers]);

	// Filter out numbers already configured as accounts
	const configuredPhoneNumberIds = new Set(
		(existingAccounts ?? []).map((a) => a.phoneNumberId).filter(Boolean),
	);
	const availableNumbers = discoveredNumbers.filter(
		(n) => !configuredPhoneNumberIds.has(n.id),
	);

	if (mode === "loading") {
		return (
			<SetupShell>
				<div className="flex flex-col items-center gap-4 py-12">
					<Loader2 className="h-6 w-6 animate-spin text-pons-accent" />
					<div className="text-center">
						<p className="font-medium text-sm">
							Scanning your WhatsApp Business accounts...
						</p>
						<p className="mt-1 text-muted-foreground text-xs">
							Using your Facebook login to discover available numbers
						</p>
					</div>
				</div>
			</SetupShell>
		);
	}

	if (mode === "auto") {
		return (
			<AutoSetup discoveredNumbers={availableNumbers} onComplete={onComplete} />
		);
	}

	return (
		<ManualSetup
			discoveryError={discoveryError}
			onComplete={onComplete}
			onRetryDiscovery={() => setMode("loading")}
		/>
	);
}

// ── Helpers ──

/**
 * Extract the country calling code from an E.164 phone number
 * using libphonenumber-js (Google's phone metadata).
 * e.g. "+18302228750" → "1", "+4915888643259" → "49"
 */
function getCallingCode(phoneNumber: string): string {
	const parsed = parsePhoneNumber(phoneNumber);
	return parsed?.countryCallingCode ?? "";
}

/**
 * Build a Twilio Console deep link to buy a specific number.
 * Pre-fills country, number type, SMS capability, and the number itself.
 */
function buildTwilioConsoleUrl(
	isoCountry: string,
	phoneNumber: string,
	numberType?: "Local" | "Mobile" | "TollFree",
): string {
	// Strip the dial code prefix to get the local number for searchTerm
	const callingCode = getCallingCode(phoneNumber);
	const stripped =
		callingCode && phoneNumber.startsWith(`+${callingCode}`)
			? phoneNumber.slice(1 + callingCode.length) // strip "+" + calling code
			: phoneNumber.replace(/^\+/, "");

	const params = new URLSearchParams();
	params.set("isoCountry", isoCountry.toUpperCase());
	// Number types — include all if we don't know, otherwise just the matched type
	const types =
		numberType === "Mobile"
			? ["Mobile"]
			: numberType === "TollFree"
				? ["Tollfree"]
				: numberType === "Local"
					? ["Local"]
					: ["Local", "Mobile", "Tollfree"];
	for (const t of types) params.append("types[]", t);
	params.append("capabilities[]", "Sms");
	params.append("capabilities[]", "Voice");
	params.set("searchTerm", stripped);
	params.set("searchFilter", "left");
	params.set("searchType", "number");

	return `https://console.twilio.com/us1/develop/phone-numbers/manage/search?${params}`;
}

/** Polling interval for checking if a number was purchased in the Twilio Console */
const PURCHASE_POLL_INTERVAL = 5_000; // 5 seconds

// ════════════════════════════════════════════════════════════════════════════
// AUTO SETUP — FLAT DESIGN
// ════════════════════════════════════════════════════════════════════════════

function AutoSetup({
	discoveredNumbers,
	onComplete,
}: {
	discoveredNumbers: DiscoveredNumber[];
	onComplete: () => void;
}) {
	const createExisting = useMutation(api.accounts.createExisting);
	const createByon = useMutation(api.accounts.createByon);
	const createTwilio = useMutation(api.accounts.createTwilio);
	const registerAppWebhook = useAction(
		api.whatsappDiscovery.registerAppWebhook,
	);
	const subscribeWaba = useAction(api.whatsappDiscovery.subscribeWaba);
	const addPhoneToWaba = useAction(api.phoneRegistration.addPhoneToWaba);
	const submitCode = useAction(api.phoneRegistration.submitCode);
	const resendCode = useAction(api.phoneRegistration.resendCode);
	const autoVerify = useAction(api.phoneRegistration.autoVerifyAndRegister);
	const registerExisting = useAction(
		api.phoneRegistration.registerExistingNumber,
	);

	// Twilio credentials
	const twilioCredentials = useQuery(api.twilioConnect.getCredentials);
	const validateTwilio = useAction(api.twilioConnect.validateCredentials);
	const saveTwilioCreds = useMutation(api.twilioConnect.saveCredentials);
	const listTwilioNumbers = useAction(api.twilioConnect.listExistingNumbers);
	const listTwilioCountries = useAction(
		api.twilioConnect.listAvailableCountries,
	);
	const searchTwilioNumbers = useAction(api.twilioConnect.searchNumbers);
	const buyTwilioNumber = useAction(api.twilioConnect.buyNumber);
	const configureSmsWebhook = useAction(api.twilioConnect.configureSmsWebhook);

	// Wizard state
	const [step, setStep] = useState<WizardStep>("pick-number");
	const [newNumberPanel, setNewNumberPanel] = useState<
		null | "byon" | "twilio"
	>(null);

	// Selected existing number (for configure step)
	const [selectedNumber, setSelectedNumber] = useState<DiscoveredNumber | null>(
		null,
	);

	// PIN for existing numbers that need Cloud API registration
	const [existingPin, setExistingPin] = useState("");

	// BYON form state
	const [byonPhone, setByonPhone] = useState("");
	const [byonDisplayName, setByonDisplayName] = useState("");
	const [byonCountryCode, setByonCountryCode] = useState("");
	const [byonWabaId, setByonWabaId] = useState("");

	// Twilio credentials form
	const [twilioSid, setTwilioSid] = useState("");
	const [twilioToken, setTwilioToken] = useState("");
	const [twilioValidating, setTwilioValidating] = useState(false);
	const [twilioSaveError, setTwilioSaveError] = useState<string | null>(null);

	// Twilio number browsing
	const [twilioCredentialsId, setTwilioCredentialsId] =
		useState<Id<"twilioCredentials"> | null>(null);
	const [twilioOwnedNumbers, setTwilioOwnedNumbers] = useState<
		TwilioOwnedNumber[]
	>([]);
	const [twilioAvailableCountryCodes, setTwilioAvailableCountryCodes] =
		useState<string[]>([]);
	const [twilioCountry, setTwilioCountry] = useState("");
	const [twilioAreaCode, setTwilioAreaCode] = useState("");
	const [twilioAvailableNumbers, setTwilioAvailableNumbers] = useState<
		TwilioAvailableNumber[]
	>([]);
	const [twilioSelectedNumber, setTwilioSelectedNumber] = useState<
		(TwilioOwnedNumber & { isoCountry?: string }) | TwilioAvailableNumber | null
	>(null);
	const [twilioDisplayName, setTwilioDisplayName] = useState("");
	const [twilioWabaId, setTwilioWabaId] = useState("");

	// Twilio panel inline loading (for fetching owned numbers on panel expand)
	const [twilioInlineLoading, setTwilioInlineLoading] = useState(false);

	// Twilio regulatory error (shown when buy fails due to address/bundle requirement)
	const [twilioRegulatoryError, setTwilioRegulatoryError] = useState<
		string | null
	>(null);

	// Verification state
	const [otpCode, setOtpCode] = useState("");
	const [twoStepPin, setTwoStepPin] = useState("");
	const [createdAccountId, setCreatedAccountId] =
		useState<Id<"accounts"> | null>(null);
	const [phoneSourceForVerify, setPhoneSourceForVerify] = useState<
		"byon" | "twilio"
	>("byon");
	const [verifyPhoneNumber, setVerifyPhoneNumber] = useState("");

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [autoVerifyStatus, setAutoVerifyStatus] = useState<
		"waiting-pin" | "waiting-code" | "verifying" | "done"
	>("waiting-pin");

	// ── Reactive account query for auto-verification ──
	// Convex reactivity means this updates instantly when the webhook stores the code.
	const createdAccount = useQuery(
		api.accounts.get,
		createdAccountId ? { accountId: createdAccountId } : "skip",
	);

	// Auto-trigger verification when code is captured + PIN is provided
	const autoVerifyTriggeredRef = useRef(false);
	useEffect(() => {
		if (
			step !== "twilio-verifying" ||
			!createdAccountId ||
			!createdAccount?.hasVerificationCode ||
			twoStepPin.length !== 6 ||
			autoVerifyTriggeredRef.current
		)
			return;

		autoVerifyTriggeredRef.current = true;
		setAutoVerifyStatus("verifying");

		autoVerify({ accountId: createdAccountId, twoStepPin })
			.then((result) => {
				if (result.success) {
					setAutoVerifyStatus("done");
					setStep("complete");
				} else {
					setError(result.error ?? "Verification failed");
					setAutoVerifyStatus("waiting-pin");
					autoVerifyTriggeredRef.current = false;
				}
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "Verification failed");
				setAutoVerifyStatus("waiting-pin");
				autoVerifyTriggeredRef.current = false;
			});
	}, [
		step,
		createdAccountId,
		createdAccount?.hasVerificationCode,
		twoStepPin,
		autoVerify,
	]);

	// When PIN is entered and we're still waiting for the code, update status
	useEffect(() => {
		if (
			step === "twilio-verifying" &&
			twoStepPin.length === 6 &&
			autoVerifyStatus === "waiting-pin" &&
			!createdAccount?.hasVerificationCode
		) {
			setAutoVerifyStatus("waiting-code");
		}
	}, [step, twoStepPin, autoVerifyStatus, createdAccount?.hasVerificationCode]);

	// ── Poll for number purchase in Twilio Console ──
	// When a regulatory error is shown, poll the user's Twilio account every 5s
	// to detect when they've bought the number in the Console.
	const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollTimerRef.current) {
			clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		// Only poll when we have a regulatory error + a selected number + credentials
		if (
			!twilioRegulatoryError ||
			!twilioSelectedNumber ||
			!twilioCredentialsId
		) {
			stopPolling();
			return;
		}

		const targetPhone = twilioSelectedNumber.phoneNumber;

		const poll = async () => {
			try {
				const owned = await listTwilioNumbers({
					credentialsId: twilioCredentialsId,
				});
				const found = owned.find((n) => n.phoneNumber === targetPhone);
				if (found) {
					stopPolling();
					// Swap to owned number (has sid) and clear the regulatory error
					setTwilioSelectedNumber(found);
					setTwilioRegulatoryError(null);
					setTwilioOwnedNumbers(owned);
					toast.success("Number purchased! Confirm to register on WhatsApp.");
				}
			} catch {
				// Non-fatal — just retry on next tick
			}
		};

		// Initial check + start interval
		poll();
		pollTimerRef.current = setInterval(poll, PURCHASE_POLL_INTERVAL);

		return () => stopPolling();
	}, [
		twilioRegulatoryError,
		twilioSelectedNumber,
		twilioCredentialsId,
		listTwilioNumbers,
		stopPolling,
	]);

	// Unique WABAs for BYON/Twilio WABA selectors
	const uniqueWabas = Array.from(
		new Map(
			discoveredNumbers.map((n) => [
				n.wabaId,
				{ id: n.wabaId, name: n.wabaName, businessName: n.businessName },
			]),
		).values(),
	);

	// Auto-fetch owned Twilio numbers when the panel opens and credentials exist
	useEffect(() => {
		if (newNumberPanel !== "twilio" || !twilioCredentials) return;
		// Don't re-fetch if we already have them loaded (e.g. came back from twilio-search)
		if (twilioOwnedNumbers.length > 0) return;

		const credId = twilioCredentials._id;
		setTwilioCredentialsId(credId);
		setTwilioInlineLoading(true);

		listTwilioNumbers({ credentialsId: credId })
			.then((owned) => setTwilioOwnedNumbers(owned))
			.catch(() => {
				// Non-fatal
			})
			.finally(() => setTwilioInlineLoading(false));
	}, [
		newNumberPanel,
		twilioCredentials,
		twilioOwnedNumbers.length,
		listTwilioNumbers,
	]);

	// ── Handlers ──

	// Connect existing number
	const handleConnectExisting = async () => {
		if (!selectedNumber) return;

		// Check if the number needs Cloud API registration.
		// Meta's `status` field ("CONNECTED") means "on the WABA" — NOT registered
		// with Cloud API. The real indicator is `platform_type === "CLOUD_API"`.
		const needsRegistration = selectedNumber.platform_type !== "CLOUD_API";

		// If registration is needed, require a PIN
		if (needsRegistration && existingPin.length !== 6) {
			setError(
				"Please enter a 6-digit PIN for WhatsApp two-step verification.",
			);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			await registerAppWebhook();
			await subscribeWaba({ wabaId: selectedNumber.wabaId });
			const accountId = await createExisting({
				name: selectedNumber.verified_name || selectedNumber.wabaName,
				wabaId: selectedNumber.wabaId,
				phoneNumberId: selectedNumber.id,
				phoneNumber: selectedNumber.display_phone_number,
				displayName: selectedNumber.verified_name,
				isRegistered: !needsRegistration,
			});

			// If the number isn't registered with Cloud API, register it now
			if (needsRegistration) {
				await registerExisting({
					accountId,
					twoStepPin: existingPin,
				});
			}

			setStep("complete");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to connect account",
			);
		} finally {
			setLoading(false);
		}
	};

	// Start BYON flow
	const handleStartByon = async () => {
		if (!byonPhone || !byonDisplayName || !byonCountryCode || !byonWabaId)
			return;
		setLoading(true);
		setError(null);

		try {
			await registerAppWebhook();
			await subscribeWaba({ wabaId: byonWabaId });

			const accountId = await createByon({
				name: byonDisplayName,
				wabaId: byonWabaId,
				phoneNumber: byonPhone,
				displayName: byonDisplayName,
				countryCode: byonCountryCode,
			});
			setCreatedAccountId(accountId);
			setPhoneSourceForVerify("byon");
			setVerifyPhoneNumber(byonPhone);

			await addPhoneToWaba({ accountId });

			setStep("verify-code");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to add phone number",
			);
		} finally {
			setLoading(false);
		}
	};

	// Validate & save Twilio credentials, then go straight to browse
	const handleSaveTwilio = async () => {
		if (!twilioSid || !twilioToken) return;
		setTwilioValidating(true);
		setTwilioSaveError(null);

		try {
			const result = await validateTwilio({
				accountSid: twilioSid,
				authToken: twilioToken,
			});

			if (!result.valid) {
				setTwilioSaveError(result.error ?? "Invalid credentials");
				return;
			}

			const credId = await saveTwilioCreds({
				accountSid: twilioSid,
				authToken: twilioToken,
				friendlyName: result.friendlyName,
			});

			toast.success(
				`Connected as ${result.friendlyName ?? twilioSid.slice(0, 12)}`,
			);

			setTwilioSid("");
			setTwilioToken("");
			setTwilioCredentialsId(credId);

			// Immediately browse numbers + fetch countries
			const [owned, countries] = await Promise.all([
				listTwilioNumbers({ credentialsId: credId }),
				listTwilioCountries({ credentialsId: credId }),
			]);
			setTwilioOwnedNumbers(owned);
			setTwilioAvailableCountryCodes(countries.map((c) => c.countryCode));
			setStep("twilio-search");
		} catch (err) {
			setTwilioSaveError(
				err instanceof Error ? err.message : "Failed to save credentials",
			);
		} finally {
			setTwilioValidating(false);
		}
	};

	// Browse Twilio numbers + fetch available countries
	const handleBrowseTwilio = async () => {
		if (!twilioCredentials) return;
		setLoading(true);
		setError(null);

		try {
			const credId = twilioCredentials._id;
			setTwilioCredentialsId(credId);
			const [owned, countries] = await Promise.all([
				listTwilioNumbers({ credentialsId: credId }),
				listTwilioCountries({ credentialsId: credId }),
			]);
			setTwilioOwnedNumbers(owned);
			setTwilioAvailableCountryCodes(countries.map((c) => c.countryCode));
			setStep("twilio-search");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to list Twilio numbers",
			);
		} finally {
			setLoading(false);
		}
	};

	// Search for available Twilio numbers
	const handleTwilioSearch = async () => {
		if (!twilioCredentialsId || !twilioCountry) return;
		setLoading(true);
		setError(null);

		try {
			const numbers = await searchTwilioNumbers({
				credentialsId: twilioCredentialsId,
				countryCode: twilioCountry.toUpperCase(),
				areaCode: twilioAreaCode || undefined,
				smsEnabled: true,
				limit: 20,
			});
			setTwilioAvailableNumbers(numbers);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to search numbers");
		} finally {
			setLoading(false);
		}
	};

	// Select a Twilio number and transition to confirm step
	const handleSelectTwilioNumber = (
		num: TwilioAvailableNumber | (TwilioOwnedNumber & { isoCountry?: string }),
	) => {
		setTwilioSelectedNumber(num);
		setTwilioRegulatoryError(null);
		setStep("twilio-confirm");
	};

	// Buy Twilio number and register on WABA
	const handleTwilioBuy = async () => {
		if (
			!twilioCredentialsId ||
			!twilioSelectedNumber ||
			!twilioDisplayName ||
			!twilioWabaId
		)
			return;
		setLoading(true);
		setError(null);
		setTwilioRegulatoryError(null);

		try {
			const isNewPurchase =
				"isoCountry" in twilioSelectedNumber &&
				!!twilioSelectedNumber.isoCountry;

			let phoneNumberSid: string;
			let phoneNumber: string;

			if (isNewPurchase) {
				// Buy the number via Twilio
				const result = await buyTwilioNumber({
					credentialsId: twilioCredentialsId,
					phoneNumber: twilioSelectedNumber.phoneNumber,
				});

				if (!result.ok) {
					if (result.regulatory) {
						// Regulatory error — show helpful message instead of generic error
						setTwilioRegulatoryError(result.message);
						setLoading(false);
						return;
					}
					throw new Error(result.message);
				}

				phoneNumberSid = result.sid;
				phoneNumber = result.phoneNumber;
			} else {
				// Using an existing owned number
				const owned = twilioSelectedNumber as TwilioOwnedNumber;
				phoneNumberSid = owned.sid;
				phoneNumber = owned.phoneNumber;
			}

			// Extract country calling code (e.g. "1" for US, "49" for DE)
			const countryCode = getCallingCode(phoneNumber);

			// Ensure SMS webhook is configured (for auto-capturing Meta OTP)
			await configureSmsWebhook({
				credentialsId: twilioCredentialsId,
				phoneNumberSid,
			});

			await registerAppWebhook();
			await subscribeWaba({ wabaId: twilioWabaId });

			const accountId = await createTwilio({
				name: twilioDisplayName,
				wabaId: twilioWabaId,
				phoneNumber,
				displayName: twilioDisplayName,
				countryCode,
				twilioCredentialsId: twilioCredentialsId,
				twilioPhoneNumberSid: phoneNumberSid,
			});
			setCreatedAccountId(accountId);
			setPhoneSourceForVerify("twilio");
			setVerifyPhoneNumber(phoneNumber);

			await addPhoneToWaba({ accountId });

			// Twilio numbers get auto-verified via SMS webhook
			setStep("twilio-verifying");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to buy number");
		} finally {
			setLoading(false);
		}
	};

	// Submit verification code
	const handleSubmitCode = async () => {
		if (!createdAccountId || !otpCode || !twoStepPin) return;
		setLoading(true);
		setError(null);

		try {
			await submitCode({
				accountId: createdAccountId,
				code: otpCode,
				twoStepPin,
			});
			setStep("complete");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Verification failed");
		} finally {
			setLoading(false);
		}
	};

	// Resend code
	const handleResendCode = async () => {
		if (!createdAccountId) return;
		setLoading(true);
		setError(null);

		try {
			await resendCode({ accountId: createdAccountId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to resend code");
		} finally {
			setLoading(false);
		}
	};

	return (
		<SetupShell>
			{error && (
				<div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					{error}
				</div>
			)}

			{/* ── Main screen: pick-number ── */}
			{step === "pick-number" && (
				<div className="space-y-6">
					{/* ── Set up a new number ── */}
					<h3 className="font-display font-medium text-sm">
						Set up a new number
					</h3>

					<div className="space-y-2">
						{/* Bring your own number */}
						{newNumberPanel !== "byon" ? (
							<Item
								className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
								onClick={() => setNewNumberPanel("byon")}
								variant="outline"
							>
								<ItemMedia>
									<Phone className="size-5 text-pons-accent" />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>Bring your own number</ItemTitle>
									<ItemDescription className="text-xs">
										Register an existing phone number on WhatsApp
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<ChevronRight className="size-4 text-muted-foreground" />
								</ItemActions>
							</Item>
						) : (
							<div className="space-y-4 rounded-md border border-pons-accent/40 p-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<Phone className="size-4 text-pons-accent" />
										<span className="font-medium text-sm">
											Bring your own number
										</span>
									</div>
									<button
										className="text-muted-foreground text-xs hover:text-foreground"
										onClick={() => setNewNumberPanel(null)}
										type="button"
									>
										Cancel
									</button>
								</div>

								<div className="space-y-2">
									{uniqueWabas.length > 0 && (
										<div className="space-y-1">
											<Label className="text-xs" htmlFor="byon-waba">
												WhatsApp Business Account
											</Label>
											<select
												className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
												id="byon-waba"
												onChange={(e) => setByonWabaId(e.target.value)}
												value={byonWabaId}
											>
												<option value="">Select a WABA...</option>
												{uniqueWabas.map((w) => (
													<option key={w.id} value={w.id}>
														{w.name} ({w.businessName})
													</option>
												))}
											</select>
										</div>
									)}
									{uniqueWabas.length === 0 && (
										<div className="space-y-1">
											<Label className="text-xs" htmlFor="byon-waba-manual">
												WABA ID
											</Label>
											<Input
												id="byon-waba-manual"
												onChange={(e) => setByonWabaId(e.target.value)}
												placeholder="1234567890123456"
												value={byonWabaId}
											/>
										</div>
									)}
									<div className="flex gap-2">
										<div className="w-24 space-y-1">
											<Label className="text-xs" htmlFor="byon-cc">
												Country
											</Label>
											<Input
												id="byon-cc"
												onChange={(e) => setByonCountryCode(e.target.value)}
												placeholder="49"
												value={byonCountryCode}
											/>
										</div>
										<div className="flex-1 space-y-1">
											<Label className="text-xs" htmlFor="byon-phone">
												Phone Number
											</Label>
											<Input
												id="byon-phone"
												onChange={(e) => setByonPhone(e.target.value)}
												placeholder="+4917612345678"
												value={byonPhone}
											/>
										</div>
									</div>
									<div className="space-y-1">
										<Label className="text-xs" htmlFor="byon-name">
											Display Name
										</Label>
										<Input
											id="byon-name"
											onChange={(e) => setByonDisplayName(e.target.value)}
											placeholder="My Business"
											value={byonDisplayName}
										/>
										<p className="text-[11px] text-muted-foreground">
											Shown to WhatsApp recipients. Must match your business
											name. Subject to Meta review.
										</p>
									</div>
								</div>

								<Button
									className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
									disabled={
										loading ||
										!byonPhone ||
										!byonDisplayName ||
										!byonCountryCode ||
										!byonWabaId
									}
									onClick={handleStartByon}
									size="sm"
								>
									{loading ? (
										<>
											<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
											Adding number...
										</>
									) : (
										"Add Number & Send Code"
									)}
								</Button>
							</div>
						)}

						{/* Buy via Twilio */}
						{newNumberPanel !== "twilio" ? (
							<Item
								className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
								onClick={() => setNewNumberPanel("twilio")}
								variant="outline"
							>
								<ItemMedia>
									<ShoppingCart className="size-5 text-pons-accent" />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>Buy a number via Twilio</ItemTitle>
									<ItemDescription className="text-xs">
										Purchase a new phone number for ~$1/mo
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<ChevronRight className="size-4 text-muted-foreground" />
								</ItemActions>
							</Item>
						) : (
							<div className="space-y-4 rounded-md border border-pons-accent/40 p-4">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<ShoppingCart className="size-4 text-pons-accent" />
										<span className="font-medium text-sm">Buy via Twilio</span>
										<span className="text-muted-foreground text-xs">
											~$1/mo
										</span>
									</div>
									<button
										className="text-muted-foreground text-xs hover:text-foreground"
										onClick={() => setNewNumberPanel(null)}
										type="button"
									>
										Cancel
									</button>
								</div>

								{twilioCredentials ? (
									<div className="space-y-3">
										<div className="flex items-center gap-2 text-muted-foreground text-xs">
											<Check className="h-3.5 w-3.5 text-pons-accent" />
											Connected as{" "}
											<span className="font-medium text-foreground">
												{twilioCredentials.friendlyName ??
													twilioCredentials.accountSid.slice(0, 12)}
											</span>
										</div>

										{/* Inline owned numbers */}
										{twilioInlineLoading && (
											<div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
												<Loader2 className="h-3.5 w-3.5 animate-spin" />
												Loading your numbers...
											</div>
										)}

										{!twilioInlineLoading && twilioOwnedNumbers.length > 0 && (
											<div className="space-y-1.5">
												{twilioOwnedNumbers.map((num) => (
													<Item
														className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
														key={num.sid}
														onClick={() => {
															setTwilioSelectedNumber(num);
															setTwilioRegulatoryError(null);
															setStep("twilio-confirm");
														}}
														size="sm"
														variant="outline"
													>
														<ItemMedia>
															<Phone className="size-4 text-pons-accent" />
														</ItemMedia>
														<ItemContent>
															<ItemTitle className="font-mono text-sm">
																{num.phoneNumber}
															</ItemTitle>
															<ItemDescription className="text-xs">
																{num.friendlyName}
															</ItemDescription>
														</ItemContent>
														<ItemActions>
															{num.capabilities.sms && (
																<span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-600">
																	SMS
																</span>
															)}
															<ChevronRight className="size-4 text-muted-foreground" />
														</ItemActions>
													</Item>
												))}
											</div>
										)}

										{!twilioInlineLoading &&
											twilioOwnedNumbers.length === 0 && (
												<p className="py-1 text-muted-foreground text-xs">
													No numbers on this account yet.
												</p>
											)}

										{/* Divider + browse for new numbers */}
										<div className="relative">
											<div className="absolute inset-0 flex items-center">
												<span className="w-full border-t" />
											</div>
											<div className="relative flex justify-center text-xs">
												<span className="bg-background px-2 text-muted-foreground">
													or
												</span>
											</div>
										</div>

										<Button
											className="w-full"
											disabled={loading}
											onClick={handleBrowseTwilio}
											size="sm"
											variant="outline"
										>
											{loading ? (
												<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
											) : (
												<ShoppingCart className="mr-2 h-3.5 w-3.5" />
											)}
											Browse &amp; buy a new number
										</Button>
									</div>
								) : (
									<div className="space-y-3">
										<p className="text-muted-foreground text-xs">
											Paste your Account SID and Auth Token from the{" "}
											<a
												className="inline-flex items-center gap-1 text-pons-accent underline underline-offset-2 hover:text-pons-accent-bright"
												href="https://console.twilio.com/"
												rel="noopener noreferrer"
												target="_blank"
											>
												Twilio Console
												<ExternalLink className="h-3 w-3" />
											</a>
										</p>
										<div className="space-y-2">
											<Input
												onChange={(e) => setTwilioSid(e.target.value)}
												placeholder="Account SID (AC...)"
												value={twilioSid}
											/>
											<Input
												onChange={(e) => setTwilioToken(e.target.value)}
												placeholder="Auth Token"
												type="password"
												value={twilioToken}
											/>
										</div>
										{twilioSaveError && (
											<p className="text-destructive text-xs">
												{twilioSaveError}
											</p>
										)}
										<Button
											className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
											disabled={
												twilioValidating ||
												!twilioSid.startsWith("AC") ||
												!twilioToken
											}
											onClick={handleSaveTwilio}
											size="sm"
										>
											{twilioValidating ? (
												<>
													<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
													Validating...
												</>
											) : (
												"Connect Twilio"
											)}
										</Button>
									</div>
								)}
							</div>
						)}
					</div>

					{/* ── Existing WABA numbers ── */}
					{discoveredNumbers.length > 0 && (
						<>
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs">
									<span className="bg-background px-2 text-muted-foreground">
										or
									</span>
								</div>
							</div>

							<h3 className="font-display font-medium text-sm">
								Connect a configured number
							</h3>

							<div className="space-y-2">
								{discoveredNumbers.map((num) => (
									<Item
										className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
										key={`${num.wabaId}-${num.id}`}
										onClick={() => {
											setSelectedNumber(num);
											setStep("configure");
										}}
										variant="outline"
									>
										<ItemMedia>
											<Phone className="size-5 text-pons-accent" />
										</ItemMedia>
										<ItemContent>
											<ItemTitle>{num.display_phone_number}</ItemTitle>
											<ItemDescription className="text-xs">
												{num.verified_name} · {num.businessName}
											</ItemDescription>
										</ItemContent>
										<ItemActions>
											<QualityBadge rating={num.quality_rating} />
											<ChevronRight className="size-4 text-muted-foreground" />
										</ItemActions>
									</Item>
								))}
							</div>
						</>
					)}
				</div>
			)}

			{/* ── Configure (existing number) ── */}
			{step === "configure" && selectedNumber && (
				<div className="space-y-5">
					<Button
						className="gap-1.5 px-0 text-muted-foreground text-xs hover:text-foreground"
						onClick={() => {
							setStep("pick-number");
							setSelectedNumber(null);
						}}
						size="sm"
						variant="ghost"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Back
					</Button>
					<h3 className="font-display font-medium text-sm">
						Confirm connection
					</h3>

					<div className="rounded-lg border border-pons-accent/20 bg-pons-accent/5 p-4">
						<div className="mb-3 flex items-center gap-2 font-medium text-pons-accent text-xs">
							<Sparkles className="h-3.5 w-3.5" />
							Auto-detected
						</div>
						<div className="space-y-2 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Business</span>
								<span className="font-medium">
									{selectedNumber.businessName}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">WABA</span>
								<span className="font-medium">{selectedNumber.wabaName}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Number</span>
								<span className="font-medium">
									{selectedNumber.display_phone_number}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Name</span>
								<span className="font-medium">
									{selectedNumber.verified_name}
								</span>
							</div>
						</div>
					</div>

					{selectedNumber.platform_type !== "CLOUD_API" && (
						<div className="space-y-3">
							<div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
								<p className="text-amber-600 text-sm">
									This number needs to be registered with the WhatsApp Cloud API
									{selectedNumber.platform_type
										? ` (current: ${selectedNumber.platform_type})`
										: ""}
									. Enter a 6-digit PIN to complete registration.
								</p>
							</div>
							<div>
								<Label htmlFor="existing-pin">Two-Step Verification PIN</Label>
								<Input
									id="existing-pin"
									inputMode="numeric"
									maxLength={6}
									onChange={(e) =>
										setExistingPin(e.target.value.replace(/\D/g, ""))
									}
									pattern="[0-9]*"
									placeholder="000000"
									type="text"
									value={existingPin}
								/>
								<p className="mt-1 text-muted-foreground text-xs">
									Choose a 6-digit PIN for WhatsApp two-step verification.
								</p>
							</div>
						</div>
					)}

					{selectedNumber.platform_type === "CLOUD_API" && (
						<div className="rounded-lg border border-pons-accent/20 bg-pons-accent/5 px-4 py-3">
							<p className="text-pons-accent text-sm">
								This number is registered with the Cloud API. Webhooks will be
								configured automatically.
							</p>
						</div>
					)}

					<Button
						className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
						disabled={
							loading ||
							(selectedNumber.platform_type !== "CLOUD_API" &&
								existingPin.length !== 6)
						}
						onClick={handleConnectExisting}
						size="lg"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Connecting...
							</>
						) : (
							<>
								<Sparkles className="mr-2 h-4 w-4" />
								Connect Account
							</>
						)}
					</Button>
				</div>
			)}

			{/* ── Twilio Search ── */}
			{step === "twilio-search" && (
				<div className="space-y-4">
					<BackButton
						label="Browse Twilio numbers"
						onClick={() => {
							setStep("pick-number");
							setTwilioCredentialsId(null);
							setTwilioOwnedNumbers([]);
							setTwilioAvailableNumbers([]);
							setTwilioAvailableCountryCodes([]);
							setTwilioCountry("");
							setTwilioAreaCode("");
						}}
					/>

					{/* Owned numbers */}
					{twilioOwnedNumbers.length > 0 && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<p className="font-medium text-muted-foreground text-xs">
									Your Twilio numbers
								</p>
								<button
									className="flex cursor-pointer items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
									onClick={async () => {
										if (!twilioCredentialsId) return;
										const owned = await listTwilioNumbers({
											credentialsId: twilioCredentialsId,
										});
										setTwilioOwnedNumbers(owned);
										toast.success("Numbers refreshed");
									}}
									type="button"
								>
									<RefreshCw className="h-3 w-3" />
									Refresh
								</button>
							</div>
							<div className="space-y-1.5">
								{twilioOwnedNumbers.map((num) => (
									<Item
										className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
										key={num.sid}
										onClick={() => handleSelectTwilioNumber(num)}
										size="sm"
										variant="outline"
									>
										<ItemMedia>
											<Phone className="size-4 text-pons-accent" />
										</ItemMedia>
										<ItemContent>
											<ItemTitle className="font-mono">
												{num.phoneNumber}
											</ItemTitle>
											<ItemDescription className="text-xs">
												{num.friendlyName}
											</ItemDescription>
										</ItemContent>
										<ItemActions>
											{num.capabilities.sms && (
												<span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-600">
													SMS
												</span>
											)}
											<ChevronRight className="size-4 text-muted-foreground" />
										</ItemActions>
									</Item>
								))}
							</div>
						</div>
					)}

					{/* Search for new numbers */}
					<div className="space-y-3">
						{twilioOwnedNumbers.length > 0 && (
							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs">
									<span className="bg-background px-2 text-muted-foreground">
										or buy a new number
									</span>
								</div>
							</div>
						)}

						<div className="space-y-1">
							<Label className="text-xs">Country</Label>
							<CountryCodeSelector
								availableCodes={
									twilioAvailableCountryCodes.length > 0
										? twilioAvailableCountryCodes
										: undefined
								}
								onChange={setTwilioCountry}
								placeholder="Select country..."
								value={twilioCountry}
							/>
						</div>

						<div className="space-y-1">
							<Label className="text-xs" htmlFor="twilio-area">
								Area Code{" "}
								<span className="text-muted-foreground">(optional)</span>
							</Label>
							<Input
								id="twilio-area"
								onChange={(e) => setTwilioAreaCode(e.target.value)}
								placeholder="415"
								value={twilioAreaCode}
							/>
						</div>

						<Button
							className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
							disabled={loading || !twilioCountry || !twilioCredentialsId}
							onClick={handleTwilioSearch}
							size="sm"
						>
							{loading ? (
								<>
									<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
									Searching...
								</>
							) : (
								"Search Numbers"
							)}
						</Button>

						{/* Search results */}
						{twilioAvailableNumbers.length > 0 && (
							<div className="space-y-2">
								<p className="text-muted-foreground text-xs">
									{twilioAvailableNumbers.length} numbers found:
								</p>
								<div className="max-h-64 space-y-1.5 overflow-y-auto">
									{twilioAvailableNumbers.map((num) => (
										<Item
											className="cursor-pointer hover:border-pons-accent/40 hover:bg-card/70"
											key={num.phoneNumber}
											onClick={() => handleSelectTwilioNumber(num)}
											size="sm"
											variant="outline"
										>
											<ItemMedia>
												<Phone className="size-4 text-pons-accent" />
											</ItemMedia>
											<ItemContent>
												<ItemTitle className="font-mono">
													{num.friendlyName}
												</ItemTitle>
												{num.locality && (
													<ItemDescription className="text-xs">
														{num.locality}
														{num.region ? `, ${num.region}` : ""}
													</ItemDescription>
												)}
											</ItemContent>
											<ItemActions>
												{"numberType" in num && (
													<span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-400">
														{num.numberType}
													</span>
												)}
												{num.capabilities.sms && (
													<span className="rounded-full border border-emerald-500/15 bg-emerald-500/8 px-1.5 py-0.5 text-[10px] text-emerald-600">
														SMS
													</span>
												)}
												<ChevronRight className="size-4 text-muted-foreground" />
											</ItemActions>
										</Item>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* ── Twilio Confirm ── */}
			{step === "twilio-confirm" && twilioSelectedNumber && (
				<div className="space-y-4">
					<BackButton
						label="Confirm number"
						onClick={() => {
							setStep("twilio-search");
							setTwilioSelectedNumber(null);
							setTwilioDisplayName("");
							setTwilioWabaId("");
						}}
					/>

					<div className="rounded-lg border border-pons-accent/20 bg-pons-accent/5 p-4">
						<div className="mb-3 flex items-center gap-2 font-medium text-pons-accent text-xs">
							<Phone className="h-3.5 w-3.5" />
							{"isoCountry" in twilioSelectedNumber &&
							twilioSelectedNumber.isoCountry
								? "Number to purchase"
								: "Your Twilio number"}
						</div>
						<p className="font-mono font-semibold text-lg">
							{twilioSelectedNumber.friendlyName}
						</p>
						<p className="text-muted-foreground text-xs">
							{twilioSelectedNumber.phoneNumber}
							{"locality" in twilioSelectedNumber &&
							twilioSelectedNumber.locality
								? ` · ${twilioSelectedNumber.locality}`
								: ""}
						</p>
					</div>

					<div className="space-y-3">
						{uniqueWabas.length > 0 && (
							<div className="space-y-1">
								<Label className="text-xs" htmlFor="twilio-waba">
									WhatsApp Business Account
								</Label>
								<select
									className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
									id="twilio-waba"
									onChange={(e) => setTwilioWabaId(e.target.value)}
									value={twilioWabaId}
								>
									<option value="">Select a WABA...</option>
									{uniqueWabas.map((w) => (
										<option key={w.id} value={w.id}>
											{w.name} ({w.businessName})
										</option>
									))}
								</select>
							</div>
						)}
						{uniqueWabas.length === 0 && (
							<div className="space-y-1">
								<Label className="text-xs" htmlFor="twilio-waba-manual">
									WABA ID
								</Label>
								<Input
									id="twilio-waba-manual"
									onChange={(e) => setTwilioWabaId(e.target.value)}
									placeholder="1234567890123456"
									value={twilioWabaId}
								/>
							</div>
						)}

						<div className="space-y-1">
							<Label className="text-xs" htmlFor="twilio-display-name">
								Display Name
							</Label>
							<Input
								id="twilio-display-name"
								onChange={(e) => setTwilioDisplayName(e.target.value)}
								placeholder="My Business"
								value={twilioDisplayName}
							/>
							<p className="text-[11px] text-muted-foreground">
								Shown to WhatsApp recipients. Must match your business name.
								Subject to Meta review.
							</p>
						</div>
					</div>

					{/* ── Regulatory error (buy failed due to address/bundle) ── */}
					{twilioRegulatoryError && (
						<div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
							<div className="flex items-start gap-2">
								<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
								<div className="space-y-1">
									<p className="font-medium text-amber-200 text-sm">
										Regulatory compliance required
									</p>
									<p className="text-muted-foreground text-xs">
										This number requires regulatory documents before it can be
										purchased via API. Buy it directly in the Twilio Console —
										we'll detect the purchase automatically.
									</p>
								</div>
							</div>
							<a
								className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-amber-500/20 px-3 py-2 font-medium text-amber-200 text-sm transition-colors hover:bg-amber-500/30"
								href={(() => {
									const num = twilioSelectedNumber as TwilioAvailableNumber;
									return num.isoCountry
										? buildTwilioConsoleUrl(
												num.isoCountry,
												num.phoneNumber,
												num.numberType,
											)
										: "https://console.twilio.com/us1/develop/phone-numbers/manage/search";
								})()}
								rel="noopener noreferrer"
								target="_blank"
							>
								<ExternalLink className="h-3.5 w-3.5" />
								Buy in Twilio Console
							</a>
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
									<Loader2 className="h-3 w-3 animate-spin" />
									Waiting for purchase...
								</div>
								<button
									className="cursor-pointer text-muted-foreground text-xs transition-colors hover:text-foreground"
									onClick={() => {
										setTwilioRegulatoryError(null);
										setTwilioSelectedNumber(null);
										setStep("twilio-search");
									}}
									type="button"
								>
									Pick a different number
								</button>
							</div>
						</div>
					)}

					{!twilioRegulatoryError && (
						<>
							<Button
								className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
								disabled={loading || !twilioDisplayName || !twilioWabaId}
								onClick={handleTwilioBuy}
								size="lg"
							>
								{loading ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										{"isoCountry" in twilioSelectedNumber &&
										twilioSelectedNumber.isoCountry
											? "Purchasing & registering..."
											: "Registering..."}
									</>
								) : (
									<>
										<Sparkles className="mr-2 h-4 w-4" />
										{"isoCountry" in twilioSelectedNumber &&
										twilioSelectedNumber.isoCountry
											? "Buy Number & Register"
											: "Register on WhatsApp"}
									</>
								)}
							</Button>

							<p className="text-center text-muted-foreground text-xs">
								{"isoCountry" in twilioSelectedNumber &&
								twilioSelectedNumber.isoCountry
									? "The number will be purchased on your Twilio account, then registered on your WhatsApp Business Account."
									: "This number will be registered on your WhatsApp Business Account."}
							</p>
						</>
					)}
				</div>
			)}

			{/* ── Twilio Auto-Verification ── */}
			{step === "twilio-verifying" && (
				<div className="space-y-5">
					<div>
						<h3 className="font-display font-medium text-sm">
							Verifying Number
						</h3>
						<p className="mt-1 text-muted-foreground text-sm">
							We sent a verification code to{" "}
							<span className="font-medium font-mono text-foreground">
								{verifyPhoneNumber || "your number"}
							</span>
							. It will be captured automatically via Twilio.
						</p>
					</div>

					{/* Two-step PIN — always needed */}
					{autoVerifyStatus === "waiting-pin" && (
						<div className="space-y-3">
							<div className="space-y-2">
								<Label htmlFor="twilio-pin">Two-Step PIN</Label>
								<Input
									autoFocus
									id="twilio-pin"
									maxLength={6}
									onChange={(e) =>
										setTwoStepPin(e.target.value.replace(/\D/g, ""))
									}
									placeholder="Choose a 6-digit PIN"
									value={twoStepPin}
								/>
								<p className="text-muted-foreground text-xs">
									Choose a 6-digit PIN for WhatsApp two-step verification.
									Remember this — you'll need it if you re-register.
								</p>
							</div>
						</div>
					)}

					{/* Progress steps */}
					{autoVerifyStatus !== "waiting-pin" && (
						<div className="space-y-2.5 rounded-lg border bg-card p-4">
							<VerifyStep
								active={autoVerifyStatus === "waiting-code"}
								done={
									autoVerifyStatus === "verifying" ||
									autoVerifyStatus === "done"
								}
								label="Waiting for verification code..."
							/>
							<VerifyStep
								active={autoVerifyStatus === "verifying"}
								done={autoVerifyStatus === "done"}
								label="Verifying & registering number..."
							/>
						</div>
					)}

					{error && (
						<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{error}
						</div>
					)}
				</div>
			)}

			{/* ── Verify Code (BYON only) ── */}
			{step === "verify-code" && (
				<div className="space-y-4">
					<h3 className="font-display font-medium text-sm">
						Enter Verification Code
					</h3>
					<p className="text-muted-foreground text-sm">
						We sent a 6-digit code to{" "}
						<span className="font-medium font-mono text-foreground">
							{verifyPhoneNumber || "your number"}
						</span>
						. Enter it below.
					</p>

					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="otp-code">Verification Code</Label>
							<Input
								autoFocus
								id="otp-code"
								maxLength={6}
								onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
								placeholder="123456"
								value={otpCode}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="two-step-pin">Two-Step PIN</Label>
							<Input
								id="two-step-pin"
								maxLength={6}
								onChange={(e) =>
									setTwoStepPin(e.target.value.replace(/\D/g, ""))
								}
								placeholder="Choose a 6-digit PIN"
								value={twoStepPin}
							/>
							<p className="text-muted-foreground text-xs">
								Choose a 6-digit PIN for WhatsApp two-step verification.
								Remember this — you'll need it if you re-register.
							</p>
						</div>
					</div>

					<Button
						className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
						disabled={
							loading || otpCode.length !== 6 || twoStepPin.length !== 6
						}
						onClick={handleSubmitCode}
						size="lg"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Verifying...
							</>
						) : (
							<>
								<Check className="mr-2 h-4 w-4" />
								Verify & Register
							</>
						)}
					</Button>

					<button
						className="mx-auto flex items-center gap-1.5 text-muted-foreground text-xs transition hover:text-foreground"
						disabled={loading}
						onClick={handleResendCode}
						type="button"
					>
						<RefreshCw className="h-3 w-3" />
						Resend code
					</button>
				</div>
			)}

			{/* ── Complete ── */}
			{step === "complete" && (
				<div className="space-y-5 py-4 text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pons-accent/10 ring-1 ring-pons-accent/20">
						<Check className="h-7 w-7 text-pons-accent" />
					</div>
					<div>
						<h3 className="font-display font-semibold text-lg">
							Account Connected!
						</h3>
						{phoneSourceForVerify === "byon" ||
						phoneSourceForVerify === "twilio" ? (
							<p className="mt-2 text-muted-foreground text-sm">
								Your number is registered. The display name is now under Meta
								review (typically 1-3 days). You can start sending messages once
								approved.
							</p>
						) : (
							<p className="mt-2 text-muted-foreground text-sm">
								Your WhatsApp Business number is ready. You can now send and
								receive messages.
							</p>
						)}
					</div>
					<Button
						className="bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
						onClick={onComplete}
						size="lg"
					>
						Go to Dashboard
					</Button>
				</div>
			)}
		</SetupShell>
	);
}

// ── Verify step indicator ──

function VerifyStep({
	label,
	active,
	done,
}: {
	label: string;
	active: boolean;
	done: boolean;
}) {
	return (
		<div className="flex items-center gap-2.5">
			{done ? (
				<Check className="h-4 w-4 text-pons-accent" />
			) : active ? (
				<Loader2 className="h-4 w-4 animate-spin text-pons-accent" />
			) : (
				<div className="h-4 w-4 rounded-full border border-border" />
			)}
			<span
				className={
					done
						? "text-foreground text-sm"
						: active
							? "text-foreground text-sm"
							: "text-muted-foreground text-sm"
				}
			>
				{label}
			</span>
		</div>
	);
}

// ════════════════════════════════════════════════════════════════════════════
// MANUAL SETUP (fallback)
// ════════════════════════════════════════════════════════════════════════════

function ManualSetup({
	onComplete,
	discoveryError,
	onRetryDiscovery,
}: {
	onComplete: () => void;
	discoveryError: string | null;
	onRetryDiscovery: () => void;
}) {
	const createExisting = useMutation(api.accounts.createExisting);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [formData, setFormData] = useState({
		name: "",
		wabaId: "",
		phoneNumberId: "",
		phoneNumber: "",
		displayName: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			await createExisting({
				name: formData.name,
				wabaId: formData.wabaId,
				phoneNumberId: formData.phoneNumberId,
				phoneNumber: formData.phoneNumber,
				displayName: formData.displayName || formData.name,
			});
			onComplete();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create account");
		} finally {
			setLoading(false);
		}
	};

	const updateField = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
	};

	return (
		<SetupShell>
			{discoveryError && (
				<div className="mb-4 rounded-md bg-muted/50 px-3 py-2">
					<div className="flex items-start gap-2 text-muted-foreground text-xs">
						<AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
						<div>
							<p>Auto-discovery unavailable. Set up manually below.</p>
							<button
								className="mt-1 inline-flex items-center gap-1 text-pons-accent hover:underline"
								onClick={onRetryDiscovery}
								type="button"
							>
								<RefreshCw className="h-3 w-3" />
								Retry auto-discovery
							</button>
						</div>
					</div>
				</div>
			)}

			<form className="space-y-5" onSubmit={handleSubmit}>
				<FormField
					id="name"
					label="Account Name"
					onChange={(v) => updateField("name", v)}
					placeholder="My Business"
					value={formData.name}
				/>
				<FormField
					hint={
						<>
							Find this in{" "}
							<a
								className="inline-flex items-center gap-1 text-pons-accent underline underline-offset-2 hover:text-pons-accent-bright"
								href="https://business.facebook.com/settings/whatsapp-business-accounts"
								rel="noopener noreferrer"
								target="_blank"
							>
								Meta Business Suite
								<ExternalLink className="h-3 w-3" />
							</a>
						</>
					}
					id="wabaId"
					label="WhatsApp Business Account ID"
					onChange={(v) => updateField("wabaId", v)}
					placeholder="1234567890123456"
					value={formData.wabaId}
				/>
				<FormField
					id="phoneNumberId"
					label="Phone Number ID"
					onChange={(v) => updateField("phoneNumberId", v)}
					placeholder="1234567890123456"
					value={formData.phoneNumberId}
				/>
				<FormField
					id="phoneNumber"
					label="Display Phone Number"
					onChange={(v) => updateField("phoneNumber", v)}
					placeholder="+1 555 123 4567"
					value={formData.phoneNumber}
				/>
				<FormField
					id="displayName"
					label="Display Name"
					onChange={(v) => updateField("displayName", v)}
					placeholder="My Business"
					value={formData.displayName}
				/>
				<div className="rounded-lg border border-pons-accent/20 bg-pons-accent/5 px-4 py-3">
					<p className="text-pons-accent text-sm">
						Webhooks are configured automatically by Pons.
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{error}
					</div>
				)}

				<Button
					className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
					disabled={loading}
					size="lg"
					type="submit"
				>
					{loading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Connecting...
						</>
					) : (
						"Connect Account"
					)}
				</Button>
			</form>
		</SetupShell>
	);
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════════════════════

function SetupShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto w-full max-w-lg px-6 py-12">
			<div className="mb-8 flex flex-col items-center gap-4 text-center">
				<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pons-accent/10 ring-1 ring-pons-accent/20">
					<MessageSquare className="h-6 w-6 text-pons-accent" />
				</div>
				<div>
					<h2 className="font-display font-semibold text-xl tracking-tight">
						Connect WhatsApp Business
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Select a phone number from your Meta Business account.
					</p>
				</div>
			</div>
			{children}
		</div>
	);
}

function BackButton({
	onClick,
	label,
}: {
	onClick: () => void;
	label: string;
}) {
	return (
		<div className="space-y-3">
			<Button
				className="gap-1.5 px-0 text-muted-foreground text-xs hover:text-foreground"
				onClick={onClick}
				size="sm"
				variant="ghost"
			>
				<ArrowLeft className="h-3.5 w-3.5" />
				Back
			</Button>
			<h3 className="font-display font-medium text-sm">{label}</h3>
		</div>
	);
}

function QualityBadge({ rating }: { rating: string }) {
	const config: Record<string, { label: string; classes: string }> = {
		GREEN: {
			label: "High",
			classes: "bg-emerald-500/8 text-emerald-600 border-emerald-500/15",
		},
		YELLOW: {
			label: "Medium",
			classes: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
		},
		RED: {
			label: "Low",
			classes: "bg-red-500/10 text-red-400 border-red-500/20",
		},
	};
	const { label, classes } = config[rating] ?? {
		label: "Not Rated",
		classes: "border-border bg-muted text-muted-foreground",
	};
	return (
		<span
			className={`rounded-full border px-2 py-0.5 font-medium text-[10px] ${classes}`}
			title="Meta Number Reputation"
		>
			{label}
		</span>
	);
}

function FormField({
	id,
	label,
	placeholder,
	type = "text",
	hint,
	value,
	onChange,
}: {
	id: string;
	label: string;
	placeholder: string;
	type?: string;
	hint?: React.ReactNode;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				required
				type={type}
				value={value}
			/>
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
		</div>
	);
}
