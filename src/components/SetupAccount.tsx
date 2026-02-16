"use client";

import { useAction, useMutation } from "convex/react";
import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	Building2,
	Check,
	ExternalLink,
	Loader2,
	MessageSquare,
	Phone,
	Plus,
	RefreshCw,
	Settings,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface SetupAccountProps {
	onComplete: () => void;
}

// ── Types ──

type Business = { id: string; name: string };
type Waba = { id: string; name: string };
type PhoneNumber = {
	id: string;
	display_phone_number: string;
	verified_name: string;
	quality_rating: string;
};

type WizardStep =
	| "discover" // Loading: scanning businesses
	| "pick-business"
	| "pick-waba"
	| "pick-phone-source" // Choose: existing / BYON / Twilio
	| "pick-existing" // Pick from existing numbers on WABA
	| "byon-input" // Enter phone number + display name
	| "verify-code" // Manual OTP entry (BYON)
	| "configure" // Final review before connecting (existing path)
	| "complete" // Success!
	| "manual"; // Fallback manual form

type PhoneSource = "existing" | "byon" | "twilio";

// ── Step indicator labels ──

const STEP_LABELS = ["Business", "WABA", "Number", "Verify", "Done"];

function getStepIndex(step: WizardStep): number {
	switch (step) {
		case "discover":
		case "pick-business":
			return 0;
		case "pick-waba":
			return 1;
		case "pick-phone-source":
		case "pick-existing":
		case "byon-input":
		case "configure":
			return 2;
		case "verify-code":
			return 3;
		case "complete":
			return 4;
		default:
			return 0;
	}
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ════════════════════════════════════════════════════════════════════════════

export function SetupAccount({ onComplete }: SetupAccountProps) {
	const [mode, setMode] = useState<"loading" | "auto" | "manual">("loading");

	const discoverBusinesses = useAction(
		api.whatsappDiscovery.discoverBusinesses,
	);

	const [businesses, setBusinesses] = useState<Business[]>([]);
	const [discoveryError, setDiscoveryError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		discoverBusinesses()
			.then((result) => {
				if (cancelled) return;
				if (result.length > 0) {
					setBusinesses(result);
					setMode("auto");
				} else {
					setMode("manual");
				}
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
	}, [discoverBusinesses]);

	if (mode === "loading") {
		return (
			<SetupShell>
				<div className="flex flex-col items-center gap-4 py-12">
					<Loader2 className="h-6 w-6 animate-spin text-pons-green" />
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
			<AutoSetup
				businesses={businesses}
				onComplete={onComplete}
				onSwitchToManual={() => setMode("manual")}
			/>
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

// ════════════════════════════════════════════════════════════════════════════
// AUTO SETUP WIZARD
// ════════════════════════════════════════════════════════════════════════════

function AutoSetup({
	businesses,
	onComplete,
	onSwitchToManual,
}: {
	businesses: Business[];
	onComplete: () => void;
	onSwitchToManual: () => void;
}) {
	const createExisting = useMutation(api.accounts.createExisting);
	const createByon = useMutation(api.accounts.createByon);
	const discoverWabas = useAction(api.whatsappDiscovery.discoverWabas);
	const discoverPhoneNumbers = useAction(
		api.whatsappDiscovery.discoverPhoneNumbers,
	);
	const registerAppWebhook = useAction(
		api.whatsappDiscovery.registerAppWebhook,
	);
	const subscribeWaba = useAction(api.whatsappDiscovery.subscribeWaba);
	const addPhoneToWaba = useAction(api.phoneRegistration.addPhoneToWaba);
	const submitCode = useAction(api.phoneRegistration.submitCode);
	const resendCode = useAction(api.phoneRegistration.resendCode);

	// Wizard state
	const [step, setStep] = useState<WizardStep>(
		businesses.length === 1 ? "pick-waba" : "pick-business",
	);
	const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(
		businesses.length === 1 ? (businesses[0] ?? null) : null,
	);
	const [wabas, setWabas] = useState<Waba[]>([]);
	const [selectedWaba, setSelectedWaba] = useState<Waba | null>(null);
	const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
	const [selectedPhone, setSelectedPhone] = useState<PhoneNumber | null>(null);
	const [phoneSource, setPhoneSource] = useState<PhoneSource | null>(null);

	// BYON form state
	const [byonPhone, setByonPhone] = useState("");
	const [byonDisplayName, setByonDisplayName] = useState("");
	const [byonCountryCode, setByonCountryCode] = useState("");

	// Verification state
	const [otpCode, setOtpCode] = useState("");
	const [twoStepPin, setTwoStepPin] = useState("");
	const [createdAccountId, setCreatedAccountId] =
		useState<Id<"accounts"> | null>(null);

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Auto-load WABAs when business is selected
	useEffect(() => {
		if (!selectedBusiness) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		discoverWabas({ businessId: selectedBusiness.id })
			.then((result) => {
				if (cancelled) return;
				setWabas(result);
				if (result.length === 1 && result[0]) {
					setSelectedWaba(result[0]);
					setStep("pick-phone-source");
				} else {
					setStep("pick-waba");
				}
			})
			.catch((err) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : "Failed to load WABAs");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedBusiness, discoverWabas]);

	// Auto-load phone numbers when WABA is selected and source is "existing"
	useEffect(() => {
		if (!selectedWaba || step !== "pick-existing") return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		discoverPhoneNumbers({ wabaId: selectedWaba.id })
			.then((result) => {
				if (cancelled) return;
				setPhoneNumbers(result);
			})
			.catch((err) => {
				if (cancelled) return;
				setError(
					err instanceof Error ? err.message : "Failed to load phone numbers",
				);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedWaba, step, discoverPhoneNumbers]);

	// Connect existing number
	const handleConnectExisting = async () => {
		if (!selectedWaba || !selectedPhone) return;
		setLoading(true);
		setError(null);

		try {
			await registerAppWebhook();
			await subscribeWaba({ wabaId: selectedWaba.id });
			await createExisting({
				name: selectedPhone.verified_name || selectedWaba.name,
				wabaId: selectedWaba.id,
				phoneNumberId: selectedPhone.id,
				phoneNumber: selectedPhone.display_phone_number,
				displayName: selectedPhone.verified_name,
				accessToken: "",
			});
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
		if (!selectedWaba || !byonPhone || !byonDisplayName || !byonCountryCode)
			return;
		setLoading(true);
		setError(null);

		try {
			await registerAppWebhook();
			await subscribeWaba({ wabaId: selectedWaba.id });

			// Create account in adding_number state
			const accountId = await createByon({
				name: byonDisplayName,
				wabaId: selectedWaba.id,
				phoneNumber: byonPhone,
				displayName: byonDisplayName,
				countryCode: byonCountryCode,
				accessToken: "",
			});
			setCreatedAccountId(accountId);

			// Add phone to WABA and request verification code
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
			{/* Step indicator */}
			{step !== "manual" && (
				<div className="mb-6 flex items-center justify-center gap-2">
					{STEP_LABELS.map((label, i) => {
						const stepIndex = getStepIndex(step);
						const isActive = i <= stepIndex;
						return (
							<div className="flex items-center gap-2" key={label}>
								<div
									className={`flex h-6 w-6 items-center justify-center rounded-full font-medium text-[10px] ${
										isActive
											? "bg-pons-green text-primary-foreground"
											: "bg-muted text-muted-foreground"
									}`}
								>
									{i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
								</div>
								<span
									className={`hidden text-xs sm:inline ${isActive ? "text-foreground" : "text-muted-foreground"}`}
								>
									{label}
								</span>
								{i < STEP_LABELS.length - 1 && (
									<div className="h-px w-4 bg-border sm:w-8" />
								)}
							</div>
						);
					})}
				</div>
			)}

			{error && (
				<div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					{error}
				</div>
			)}

			{loading &&
				step !== "configure" &&
				step !== "verify-code" &&
				step !== "complete" && (
					<div className="flex items-center justify-center gap-2 py-8">
						<Loader2 className="h-4 w-4 animate-spin text-pons-green" />
						<span className="text-muted-foreground text-sm">Loading...</span>
					</div>
				)}

			{/* ── Step: Pick Business ── */}
			{step === "pick-business" && !loading && (
				<div className="space-y-3">
					<h3 className="font-display font-medium text-sm">
						Select a Business
					</h3>
					<div className="space-y-2">
						{businesses.map((biz) => (
							<button
								className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
								key={biz.id}
								onClick={() => setSelectedBusiness(biz)}
								type="button"
							>
								<Building2 className="h-5 w-5 text-muted-foreground" />
								<div>
									<p className="font-medium text-sm">{biz.name}</p>
									<p className="font-mono text-muted-foreground text-xs">
										{biz.id}
									</p>
								</div>
							</button>
						))}
					</div>
				</div>
			)}

			{/* ── Step: Pick WABA ── */}
			{step === "pick-waba" && !loading && (
				<div className="space-y-3">
					<BackButton
						label="Select a WhatsApp Business Account"
						onClick={() => {
							setStep("pick-business");
							setSelectedBusiness(null);
							setWabas([]);
						}}
					/>
					{wabas.length === 0 ? (
						<EmptyWabaState />
					) : (
						<div className="space-y-2">
							{wabas.map((waba) => (
								<button
									className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
									key={waba.id}
									onClick={() => {
										setSelectedWaba(waba);
										setStep("pick-phone-source");
									}}
									type="button"
								>
									<MessageSquare className="h-5 w-5 text-pons-green" />
									<div>
										<p className="font-medium text-sm">{waba.name}</p>
										<p className="font-mono text-muted-foreground text-xs">
											{waba.id}
										</p>
									</div>
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── Step: Pick Phone Source ── */}
			{step === "pick-phone-source" && !loading && (
				<div className="space-y-3">
					<BackButton
						label="How do you want to add a number?"
						onClick={() => {
							setStep("pick-waba");
							setSelectedWaba(null);
							setPhoneSource(null);
						}}
					/>
					<div className="space-y-2">
						<button
							className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
							onClick={() => {
								setPhoneSource("existing");
								setStep("pick-existing");
							}}
							type="button"
						>
							<Phone className="h-5 w-5 text-pons-green" />
							<div>
								<p className="font-medium text-sm">Use an existing number</p>
								<p className="text-muted-foreground text-xs">
									Pick a number already registered on this WABA
								</p>
							</div>
						</button>
						<button
							className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
							onClick={() => {
								setPhoneSource("byon");
								setStep("byon-input");
							}}
							type="button"
						>
							<Plus className="h-5 w-5 text-pons-green" />
							<div>
								<p className="font-medium text-sm">Bring your own number</p>
								<p className="text-muted-foreground text-xs">
									Register a new SMS-capable number on this WABA
								</p>
							</div>
						</button>
						{/* Twilio Connect — placeholder for now */}
						<div className="flex w-full items-center gap-3 rounded-lg border border-border/40 bg-card/20 p-4 text-left opacity-50">
							<Sparkles className="h-5 w-5 text-muted-foreground" />
							<div>
								<p className="font-medium text-sm">Buy via Twilio Connect</p>
								<p className="text-muted-foreground text-xs">
									Coming soon — purchase a number automatically
								</p>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ── Step: Pick Existing Number ── */}
			{step === "pick-existing" && !loading && (
				<div className="space-y-3">
					<BackButton
						label="Select a Phone Number"
						onClick={() => {
							setStep("pick-phone-source");
							setSelectedPhone(null);
							setPhoneNumbers([]);
						}}
					/>
					{phoneNumbers.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No phone numbers found on this WABA. Try "Bring your own number"
							instead.
						</p>
					) : (
						<div className="space-y-2">
							{phoneNumbers.map((phone) => (
								<button
									className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
									key={phone.id}
									onClick={() => {
										setSelectedPhone(phone);
										setStep("configure");
									}}
									type="button"
								>
									<Phone className="h-5 w-5 text-pons-green" />
									<div className="min-w-0 flex-1">
										<p className="font-medium text-sm">
											{phone.display_phone_number}
										</p>
										<p className="text-muted-foreground text-xs">
											{phone.verified_name}
										</p>
									</div>
									<QualityBadge rating={phone.quality_rating} />
								</button>
							))}
						</div>
					)}
				</div>
			)}

			{/* ── Step: BYON Input ── */}
			{step === "byon-input" && !loading && (
				<div className="space-y-4">
					<BackButton
						label="Register a new number"
						onClick={() => {
							setStep("pick-phone-source");
							setByonPhone("");
							setByonDisplayName("");
							setByonCountryCode("");
						}}
					/>

					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="byon-country">Country Code</Label>
							<Input
								id="byon-country"
								onChange={(e) => setByonCountryCode(e.target.value)}
								placeholder="49"
								value={byonCountryCode}
							/>
							<p className="text-muted-foreground text-xs">
								Without + or 00 (e.g., 49 for Germany, 1 for US)
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="byon-phone">Phone Number</Label>
							<Input
								id="byon-phone"
								onChange={(e) => setByonPhone(e.target.value)}
								placeholder="+4917612345678"
								value={byonPhone}
							/>
							<p className="text-muted-foreground text-xs">
								E.164 format — must be SMS-capable
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="byon-display-name">Display Name</Label>
							<Input
								id="byon-display-name"
								onChange={(e) => setByonDisplayName(e.target.value)}
								placeholder="My Business"
								value={byonDisplayName}
							/>
							<p className="text-muted-foreground text-xs">
								Shown to WhatsApp recipients. Must match your business name.
								Subject to Meta review.
							</p>
						</div>
					</div>

					<Button
						className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={
							loading || !byonPhone || !byonDisplayName || !byonCountryCode
						}
						onClick={handleStartByon}
						size="lg"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Adding number...
							</>
						) : (
							<>
								<ArrowRight className="mr-2 h-4 w-4" />
								Add Number &amp; Send Code
							</>
						)}
					</Button>
				</div>
			)}

			{/* ── Step: Verify Code (BYON) ── */}
			{step === "verify-code" && (
				<div className="space-y-4">
					<h3 className="font-display font-medium text-sm">
						Enter Verification Code
					</h3>
					<p className="text-muted-foreground text-sm">
						We sent a 6-digit code to{" "}
						<span className="font-medium font-mono text-foreground">
							{byonPhone}
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
						className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
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
								Verify &amp; Register
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

			{/* ── Step: Configure (existing number) ── */}
			{step === "configure" && (
				<div className="space-y-5">
					<BackButton
						label="Final Configuration"
						onClick={() => {
							setStep("pick-existing");
							setSelectedPhone(null);
						}}
					/>

					<div className="rounded-lg border border-pons-green/20 bg-pons-green/5 p-4">
						<div className="mb-3 flex items-center gap-2 font-medium text-pons-green text-xs">
							<Sparkles className="h-3.5 w-3.5" />
							Auto-detected
						</div>
						<div className="space-y-2 text-sm">
							{selectedBusiness && (
								<div className="flex justify-between">
									<span className="text-muted-foreground">Business</span>
									<span className="font-medium">{selectedBusiness.name}</span>
								</div>
							)}
							{selectedWaba && (
								<div className="flex justify-between">
									<span className="text-muted-foreground">WABA</span>
									<span className="font-medium">{selectedWaba.name}</span>
								</div>
							)}
							{selectedPhone && (
								<div className="flex justify-between">
									<span className="text-muted-foreground">Number</span>
									<span className="font-medium">
										{selectedPhone.display_phone_number}
									</span>
								</div>
							)}
						</div>
					</div>

					<div className="rounded-lg border border-pons-green/20 bg-pons-green/5 px-4 py-3">
						<p className="text-pons-green text-sm">
							Webhooks will be configured automatically. No manual setup needed.
						</p>
					</div>

					<Button
						className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={loading}
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

			{/* ── Step: Complete ── */}
			{step === "complete" && (
				<div className="space-y-5 py-4 text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-pons-green/10 ring-1 ring-pons-green/20">
						<Check className="h-7 w-7 text-pons-green" />
					</div>
					<div>
						<h3 className="font-display font-semibold text-lg">
							Account Connected!
						</h3>
						{phoneSource === "byon" ? (
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
						className="bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						onClick={onComplete}
						size="lg"
					>
						Go to Dashboard
					</Button>
				</div>
			)}

			{/* Manual setup link */}
			{step !== "complete" && step !== "verify-code" && (
				<div className="mt-6 text-center">
					<button
						className="inline-flex items-center gap-1.5 text-muted-foreground text-xs transition hover:text-foreground"
						onClick={onSwitchToManual}
						type="button"
					>
						<Settings className="h-3 w-3" />
						Set up manually instead
					</button>
				</div>
			)}
		</SetupShell>
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
		accessToken: "",
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
				accessToken: formData.accessToken,
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
								className="mt-1 inline-flex items-center gap-1 text-pons-green hover:underline"
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
								className="inline-flex items-center gap-1 text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
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
				<FormField
					hint="Create a permanent token in System Users or use a temporary test token"
					id="accessToken"
					label="Access Token"
					onChange={(v) => updateField("accessToken", v)}
					placeholder="EAAG..."
					type="password"
					value={formData.accessToken}
				/>

				<div className="rounded-lg border border-pons-green/20 bg-pons-green/5 px-4 py-3">
					<p className="text-pons-green text-sm">
						Webhooks are configured automatically by Pons.
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{error}
					</div>
				)}

				<Button
					className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
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
				<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pons-green/10 ring-1 ring-pons-green/20">
					<MessageSquare className="h-6 w-6 text-pons-green" />
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
		<div className="flex items-center gap-2">
			<button
				className="text-muted-foreground transition hover:text-foreground"
				onClick={onClick}
				type="button"
			>
				<ArrowLeft className="h-4 w-4" />
			</button>
			<h3 className="font-display font-medium text-sm">{label}</h3>
		</div>
	);
}

function EmptyWabaState() {
	return (
		<div className="space-y-3 py-4 text-center">
			<p className="text-muted-foreground text-sm">
				No WhatsApp Business Accounts found.
			</p>
			<p className="text-muted-foreground text-xs">
				Create one in{" "}
				<a
					className="inline-flex items-center gap-1 text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
					href="https://business.facebook.com/settings/whatsapp-business-accounts"
					rel="noopener noreferrer"
					target="_blank"
				>
					Meta Business Suite
					<ExternalLink className="h-3 w-3" />
				</a>
				, then come back.
			</p>
		</div>
	);
}

function QualityBadge({ rating }: { rating: string }) {
	const colors: Record<string, string> = {
		GREEN: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
		YELLOW: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
		RED: "bg-red-500/10 text-red-400 border-red-500/20",
	};
	return (
		<span
			className={`rounded-full border px-2 py-0.5 font-medium text-[10px] ${colors[rating] ?? "border-border bg-muted text-muted-foreground"}`}
		>
			{rating}
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
