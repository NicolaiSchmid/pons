"use client";

import { useAction, useMutation } from "convex/react";
import {
	AlertCircle,
	ArrowLeft,
	Building2,
	Check,
	Copy,
	Dices,
	ExternalLink,
	Loader2,
	MessageSquare,
	Phone,
	RefreshCw,
	Settings,
	Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";

interface SetupAccountProps {
	onComplete: () => void;
}

// ── Types for discovery results ──

type Business = { id: string; name: string };
type Waba = { id: string; name: string };
type PhoneNumber = {
	id: string;
	display_phone_number: string;
	verified_name: string;
	quality_rating: string;
};

type WizardStep =
	| "discover"
	| "pick-business"
	| "pick-waba"
	| "pick-phone"
	| "configure"
	| "manual";

export function SetupAccount({ onComplete }: SetupAccountProps) {
	const [mode, setMode] = useState<"loading" | "auto" | "manual">("loading");

	// Try auto-discovery first, fall back to manual
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

// ── Auto Setup Wizard ──

function AutoSetup({
	businesses,
	onComplete,
	onSwitchToManual,
}: {
	businesses: Business[];
	onComplete: () => void;
	onSwitchToManual: () => void;
}) {
	const createAccount = useMutation(api.accounts.create);
	const discoverWabas = useAction(api.whatsappDiscovery.discoverWabas);
	const discoverPhoneNumbers = useAction(
		api.whatsappDiscovery.discoverPhoneNumbers,
	);
	const subscribeWebhook = useAction(api.whatsappDiscovery.subscribeWebhook);

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
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copiedWebhook, setCopiedWebhook] = useState(false);

	// Configuration fields (still needed: appSecret, webhookVerifyToken)
	const [appSecret, setAppSecret] = useState("");
	const [webhookVerifyToken, setWebhookVerifyToken] = useState("");

	const webhookUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/api/webhook`
			: "";

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
					setStep("pick-phone");
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

	// Auto-load phone numbers when WABA is selected
	useEffect(() => {
		if (!selectedWaba || step !== "pick-phone") return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		discoverPhoneNumbers({ wabaId: selectedWaba.id })
			.then((result) => {
				if (cancelled) return;
				setPhoneNumbers(result);
				if (result.length === 1 && result[0]) {
					setSelectedPhone(result[0]);
					setStep("configure");
				}
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

	const generateToken = () => {
		const array = new Uint8Array(24);
		crypto.getRandomValues(array);
		const token = Array.from(array, (b) => b.toString(36).padStart(2, "0"))
			.join("")
			.slice(0, 32);
		setWebhookVerifyToken(token);
	};

	const copyWebhookUrl = () => {
		navigator.clipboard.writeText(webhookUrl);
		setCopiedWebhook(true);
		setTimeout(() => setCopiedWebhook(false), 2000);
	};

	const handleConnect = async () => {
		if (!selectedWaba || !selectedPhone) return;
		setLoading(true);
		setError(null);

		try {
			// Auto-subscribe the WABA to webhooks
			await subscribeWebhook({ wabaId: selectedWaba.id });

			// Create the account in Convex
			await createAccount({
				name: selectedPhone.verified_name || selectedWaba.name,
				wabaId: selectedWaba.id,
				phoneNumberId: selectedPhone.id,
				phoneNumber: selectedPhone.display_phone_number,
				accessToken: "", // Will use Facebook token; user can add System User token later
				webhookVerifyToken: webhookVerifyToken || "auto-registered",
				appSecret: appSecret,
			});

			onComplete();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to connect account",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<SetupShell>
			{/* Step indicator */}
			<div className="mb-6 flex items-center justify-center gap-2">
				{["Business", "WABA", "Number", "Configure"].map((label, i) => {
					const stepIndex = [
						"pick-business",
						"pick-waba",
						"pick-phone",
						"configure",
					].indexOf(step);
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
							{i < 3 && <div className="h-px w-4 bg-border sm:w-8" />}
						</div>
					);
				})}
			</div>

			{error && (
				<div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
					<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
					{error}
				</div>
			)}

			{loading && step !== "configure" && (
				<div className="flex items-center justify-center gap-2 py-8">
					<Loader2 className="h-4 w-4 animate-spin text-pons-green" />
					<span className="text-muted-foreground text-sm">Loading...</span>
				</div>
			)}

			{/* Pick Business */}
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
								onClick={() => {
									setSelectedBusiness(biz);
								}}
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

			{/* Pick WABA */}
			{step === "pick-waba" && !loading && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<button
							className="text-muted-foreground transition hover:text-foreground"
							onClick={() => {
								setStep("pick-business");
								setSelectedBusiness(null);
								setWabas([]);
							}}
							type="button"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
						<h3 className="font-display font-medium text-sm">
							Select a WhatsApp Business Account
						</h3>
					</div>
					{wabas.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No WhatsApp Business Accounts found under this business.
						</p>
					) : (
						<div className="space-y-2">
							{wabas.map((waba) => (
								<button
									className="flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 text-left transition hover:border-pons-green/40 hover:bg-card/70"
									key={waba.id}
									onClick={() => {
										setSelectedWaba(waba);
										setStep("pick-phone");
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

			{/* Pick Phone Number */}
			{step === "pick-phone" && !loading && (
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<button
							className="text-muted-foreground transition hover:text-foreground"
							onClick={() => {
								setStep("pick-waba");
								setSelectedWaba(null);
								setPhoneNumbers([]);
							}}
							type="button"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
						<h3 className="font-display font-medium text-sm">
							Select a Phone Number
						</h3>
					</div>
					{phoneNumbers.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							No phone numbers found under this WABA.
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

			{/* Configure (webhook + app secret) */}
			{step === "configure" && (
				<div className="space-y-5">
					<div className="flex items-center gap-2">
						<button
							className="text-muted-foreground transition hover:text-foreground"
							onClick={() => {
								setStep("pick-phone");
								setSelectedPhone(null);
							}}
							type="button"
						>
							<ArrowLeft className="h-4 w-4" />
						</button>
						<h3 className="font-display font-medium text-sm">
							Final Configuration
						</h3>
					</div>

					{/* Summary of selected items */}
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

					{/* App Secret */}
					<div className="space-y-2">
						<Label htmlFor="appSecret">App Secret</Label>
						<Input
							id="appSecret"
							onChange={(e) => setAppSecret(e.target.value)}
							placeholder="abc123..."
							required
							type="password"
							value={appSecret}
						/>
						<p className="text-muted-foreground text-xs">
							Find this in{" "}
							<a
								className="inline-flex items-center gap-1 text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
								href="https://developers.facebook.com/apps"
								rel="noopener noreferrer"
								target="_blank"
							>
								Meta App Settings → Basic
								<ExternalLink className="h-3 w-3" />
							</a>
							. Required for webhook signature verification.
						</p>
					</div>

					{/* Webhook Verify Token */}
					<div className="space-y-2">
						<Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
						<div className="flex gap-2">
							<Input
								id="webhookVerifyToken"
								onChange={(e) => setWebhookVerifyToken(e.target.value)}
								placeholder="random-string-here"
								value={webhookVerifyToken}
							/>
							<Button
								className="shrink-0 gap-1.5"
								onClick={generateToken}
								size="default"
								type="button"
								variant="secondary"
							>
								<Dices className="h-3.5 w-3.5" />
								Generate
							</Button>
						</div>
					</div>

					{/* Webhook Callback URL */}
					<div className="space-y-2">
						<Label className="text-muted-foreground text-xs">
							Callback URL
						</Label>
						<div className="flex items-center gap-2">
							<code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-foreground text-xs">
								{webhookUrl}
							</code>
							<Button
								className="shrink-0"
								onClick={copyWebhookUrl}
								size="icon"
								type="button"
								variant="ghost"
							>
								{copiedWebhook ? (
									<Check className="h-3.5 w-3.5 text-pons-green" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
							</Button>
						</div>
						<p className="text-muted-foreground text-xs">
							Pons will auto-subscribe to webhooks. Configure this URL in Meta
							if not already set.
						</p>
					</div>

					<Button
						className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={loading || !appSecret}
						onClick={handleConnect}
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

			{/* Manual setup link */}
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
		</SetupShell>
	);
}

// ── Manual Setup (existing form, kept as fallback) ──

function ManualSetup({
	onComplete,
	discoveryError,
	onRetryDiscovery,
}: {
	onComplete: () => void;
	discoveryError: string | null;
	onRetryDiscovery: () => void;
}) {
	const createAccount = useMutation(api.accounts.create);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copiedWebhook, setCopiedWebhook] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		wabaId: "",
		phoneNumberId: "",
		phoneNumber: "",
		accessToken: "",
		webhookVerifyToken: "",
		appSecret: "",
	});

	const webhookUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/api/webhook`
			: "";

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			await createAccount(formData);
			onComplete();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create account");
		} finally {
			setLoading(false);
		}
	};

	const generateToken = () => {
		const array = new Uint8Array(24);
		crypto.getRandomValues(array);
		const token = Array.from(array, (b) => b.toString(36).padStart(2, "0"))
			.join("")
			.slice(0, 32);
		setFormData((prev) => ({ ...prev, webhookVerifyToken: token }));
	};

	const copyWebhookUrl = () => {
		navigator.clipboard.writeText(webhookUrl);
		setCopiedWebhook(true);
		setTimeout(() => setCopiedWebhook(false), 2000);
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
					hint="Create a permanent token in System Users or use a temporary test token"
					id="accessToken"
					label="Access Token"
					onChange={(v) => updateField("accessToken", v)}
					placeholder="EAAG..."
					type="password"
					value={formData.accessToken}
				/>

				<div className="space-y-2">
					<Label className="text-muted-foreground text-xs">Callback URL</Label>
					<div className="flex items-center gap-2">
						<code className="flex-1 truncate rounded-md bg-muted px-3 py-2 font-mono text-foreground text-xs">
							{webhookUrl}
						</code>
						<Button
							className="shrink-0"
							onClick={copyWebhookUrl}
							size="icon"
							type="button"
							variant="ghost"
						>
							{copiedWebhook ? (
								<Check className="h-3.5 w-3.5 text-pons-green" />
							) : (
								<Copy className="h-3.5 w-3.5" />
							)}
						</Button>
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
					<div className="flex gap-2">
						<Input
							id="webhookVerifyToken"
							onChange={(e) =>
								updateField("webhookVerifyToken", e.target.value)
							}
							placeholder="random-string-here"
							required
							value={formData.webhookVerifyToken}
						/>
						<Button
							className="shrink-0 gap-1.5"
							onClick={generateToken}
							size="default"
							type="button"
							variant="secondary"
						>
							<Dices className="h-3.5 w-3.5" />
							Generate
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">
						Use both values above when configuring the webhook in Meta
					</p>
				</div>

				<FormField
					hint="Find this in your Meta App Settings → Basic"
					id="appSecret"
					label="App Secret"
					onChange={(v) => updateField("appSecret", v)}
					placeholder="abc123..."
					type="password"
					value={formData.appSecret}
				/>

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

// ── Shared Components ──

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
