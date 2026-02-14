"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Check,
	Copy,
	Dices,
	ExternalLink,
	Loader2,
	Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AccountSettingsProps {
	accountId: Id<"accounts">;
	onClose: () => void;
}

export function AccountSettings({ accountId, onClose }: AccountSettingsProps) {
	const account = useQuery(api.accounts.get, { accountId });
	const updateAccount = useMutation(api.accounts.update);

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [copiedWebhook, setCopiedWebhook] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
		accessToken: "",
		webhookVerifyToken: "",
		appSecret: "",
	});

	// Populate form when account loads
	// biome-ignore lint/correctness/useExhaustiveDependencies: Only populate when account data arrives
	useEffect(() => {
		if (account) {
			setFormData({
				name: account.name,
				accessToken: account.accessToken,
				webhookVerifyToken: account.webhookVerifyToken,
				appSecret: account.appSecret,
			});
		}
	}, [account?._id]);

	const webhookUrl =
		typeof window !== "undefined"
			? `${window.location.origin}/api/webhook`
			: "";

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setError(null);
		setSaved(false);

		try {
			await updateAccount({
				accountId,
				name: formData.name,
				accessToken: formData.accessToken,
				webhookVerifyToken: formData.webhookVerifyToken,
				appSecret: formData.appSecret,
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update account");
		} finally {
			setSaving(false);
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

	if (!account) {
		return (
			<Dialog onOpenChange={(open) => !open && onClose()} open>
				<DialogContent className="max-w-lg">
					<div className="flex items-center justify-center py-12">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog onOpenChange={(open) => !open && onClose()} open>
			<DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 font-display">
						<Settings className="h-4 w-4 text-pons-green" />
						Account Settings
					</DialogTitle>
					<DialogDescription>
						View and update your WhatsApp Business account configuration.
					</DialogDescription>
				</DialogHeader>

				{/* Read-only identifiers */}
				<div className="grid gap-3 rounded-lg border bg-card p-4">
					<ReadOnlyField label="WABA ID" mono value={account.wabaId} />
					<ReadOnlyField
						label="Phone Number ID"
						mono
						value={account.phoneNumberId}
					/>
					<ReadOnlyField label="Phone Number" value={account.phoneNumber} />
				</div>

				<Separator />

				{/* Editable fields */}
				<form className="space-y-4" onSubmit={handleSave}>
					<div className="space-y-2">
						<Label htmlFor="settings-name">Account Name</Label>
						<Input
							id="settings-name"
							onChange={(e) => updateField("name", e.target.value)}
							value={formData.name}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="settings-accessToken">Access Token</Label>
						<Input
							id="settings-accessToken"
							onChange={(e) => updateField("accessToken", e.target.value)}
							type="password"
							value={formData.accessToken}
						/>
						<p className="text-muted-foreground text-xs">
							Permanent token from{" "}
							<a
								className="inline-flex items-center gap-1 text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
								href="https://business.facebook.com/settings/system-users"
								rel="noopener noreferrer"
								target="_blank"
							>
								System Users
								<ExternalLink className="h-3 w-3" />
							</a>
						</p>
					</div>

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
					</div>

					<div className="space-y-2">
						<Label htmlFor="settings-webhookVerifyToken">
							Webhook Verify Token
						</Label>
						<div className="flex gap-2">
							<Input
								id="settings-webhookVerifyToken"
								onChange={(e) =>
									updateField("webhookVerifyToken", e.target.value)
								}
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
					</div>

					<div className="space-y-2">
						<Label htmlFor="settings-appSecret">App Secret</Label>
						<Input
							id="settings-appSecret"
							onChange={(e) => updateField("appSecret", e.target.value)}
							type="password"
							value={formData.appSecret}
						/>
						<p className="text-muted-foreground text-xs">
							Meta App Settings → Basic
						</p>
					</div>

					{error && (
						<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{error}
						</div>
					)}

					<Button
						className="w-full bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={saving}
						size="default"
						type="submit"
					>
						{saving ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving...
							</>
						) : saved ? (
							<>
								<Check className="mr-2 h-4 w-4" />
								Saved
							</>
						) : (
							"Save Changes"
						)}
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ReadOnlyField({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="shrink-0 text-muted-foreground text-xs">{label}</span>
			<span
				className={`truncate text-foreground text-xs ${mono ? "font-mono" : ""}`}
			>
				{value}
			</span>
		</div>
	);
}
