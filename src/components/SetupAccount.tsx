"use client";

import { useMutation } from "convex/react";
import {
	Check,
	Copy,
	Dices,
	ExternalLink,
	Loader2,
	MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "../../convex/_generated/api";

interface SetupAccountProps {
	onComplete: () => void;
}

export function SetupAccount({ onComplete }: SetupAccountProps) {
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
		<div className="mx-auto w-full max-w-lg px-6 py-12">
			{/* Header */}
			<div className="mb-8 flex flex-col items-center gap-4 text-center">
				<div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pons-green/10 ring-1 ring-pons-green/20">
					<MessageSquare className="h-6 w-6 text-pons-green" />
				</div>
				<div>
					<h2 className="font-display font-semibold text-xl tracking-tight">
						Connect WhatsApp Business
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Enter your Meta Business API credentials to get started.
					</p>
				</div>
			</div>

			{/* Webhook callback URL */}
			<div className="mb-8 rounded-lg border bg-card p-4">
				<Label className="mb-2 block text-muted-foreground text-xs">
					Webhook Callback URL
				</Label>
				<div className="flex items-center gap-2">
					<code className="flex-1 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-foreground text-xs">
						{webhookUrl}
					</code>
					<Button
						className="shrink-0 gap-1.5"
						onClick={copyWebhookUrl}
						size="sm"
						type="button"
						variant="secondary"
					>
						{copiedWebhook ? (
							<Check className="h-3.5 w-3.5" />
						) : (
							<Copy className="h-3.5 w-3.5" />
						)}
						{copiedWebhook ? "Copied" : "Copy"}
					</Button>
				</div>
				<p className="mt-2 text-muted-foreground text-xs">
					Paste this URL in{" "}
					<a
						className="inline-flex items-center gap-1 text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
						href="https://developers.facebook.com/apps"
						rel="noopener noreferrer"
						target="_blank"
					>
						Meta App Dashboard
						<ExternalLink className="h-3 w-3" />
					</a>{" "}
					→ WhatsApp → Configuration → Callback URL
				</p>
			</div>

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
						Use this token when configuring the webhook in Meta alongside the
						callback URL above
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
		</div>
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
