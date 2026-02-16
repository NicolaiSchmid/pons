"use client";

import { useMutation, useQuery } from "convex/react";
import {
	Check,
	ChevronDown,
	Clock,
	Crown,
	ExternalLink,
	Loader2,
	Settings,
	Shield,
	Trash2,
	User,
	UserPlus,
	XCircle,
} from "lucide-react";
import Image from "next/image";
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
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AccountSettingsProps {
	accountId: Id<"accounts">;
	onClose: () => void;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
	adding_number: { label: "Adding number", color: "text-yellow-400" },
	code_requested: { label: "Awaiting code", color: "text-yellow-400" },
	verifying_code: { label: "Verifying", color: "text-yellow-400" },
	registering: { label: "Registering", color: "text-yellow-400" },
	pending_name_review: {
		label: "Name under review",
		color: "text-yellow-400",
	},
	active: { label: "Active", color: "text-emerald-400" },
	name_declined: { label: "Name declined", color: "text-red-400" },
	failed: { label: "Failed", color: "text-red-400" },
};

export function AccountSettings({ accountId, onClose }: AccountSettingsProps) {
	const account = useQuery(api.accounts.get, { accountId });
	const secrets = useQuery(api.accounts.getSecrets, { accountId });
	const members = useQuery(api.accounts.listMembers, { accountId });
	const updateAccount = useMutation(api.accounts.update);
	const addMemberByEmail = useMutation(api.accounts.addMemberByEmail);
	const removeMember = useMutation(api.accounts.removeMember);
	const updateRole = useMutation(api.accounts.updateMemberRole);

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
	const [inviting, setInviting] = useState(false);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);

	const [formData, setFormData] = useState({
		name: "",
		accessToken: "",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only populate when account data arrives
	useEffect(() => {
		if (account && secrets) {
			setFormData({
				name: account.name,
				accessToken: secrets.accessToken,
			});
		}
	}, [account?._id, secrets]);

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
			});
			setSaved(true);
			setTimeout(() => setSaved(false), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update account");
		} finally {
			setSaving(false);
		}
	};

	const handleInviteByEmail = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inviteEmail.trim()) return;

		setInviting(true);
		setInviteError(null);

		try {
			await addMemberByEmail({
				accountId,
				email: inviteEmail.trim(),
				role: inviteRole,
			});
			setInviteEmail("");
		} catch (err) {
			setInviteError(
				err instanceof Error ? err.message : "Failed to invite member",
			);
		} finally {
			setInviting(false);
		}
	};

	const handleRemoveMember = async (userId: Id<"users">) => {
		try {
			await removeMember({ accountId, userId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove member");
		}
	};

	const handleRoleChange = async (
		userId: Id<"users">,
		role: "admin" | "member",
	) => {
		try {
			await updateRole({ accountId, userId, role });
			setRoleDropdownOpen(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update role");
		}
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

	const statusInfo = STATUS_LABELS[account.status] ?? {
		label: account.status,
		color: "text-muted-foreground",
	};

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

				{/* Status badge */}
				<div className="flex items-center gap-2 rounded-lg border bg-card p-3">
					<span className="text-muted-foreground text-xs">Status</span>
					<span className={cn("ml-auto font-medium text-xs", statusInfo.color)}>
						{statusInfo.label}
					</span>
				</div>

				{/* Failure info */}
				{account.status === "failed" && account.failedError && (
					<div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						<XCircle className="mt-0.5 h-4 w-4 shrink-0" />
						<div>
							<p className="font-medium">
								Failed at: {account.failedAtStep?.replace(/_/g, " ")}
							</p>
							<p className="mt-0.5 text-xs opacity-80">{account.failedError}</p>
						</div>
					</div>
				)}

				{/* Name review progress */}
				{account.status === "pending_name_review" && (
					<div className="flex items-start gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-400">
						<Clock className="mt-0.5 h-4 w-4 shrink-0" />
						<div>
							<p className="font-medium">Display name under review</p>
							<p className="mt-0.5 text-xs opacity-80">
								Meta typically takes 1-3 days to review. Check{" "}
								{account.nameReviewCheckCount ?? 0} of 72 completed.
							</p>
						</div>
					</div>
				)}

				{/* Read-only identifiers */}
				<div className="grid gap-3 rounded-lg border bg-card p-4">
					<ReadOnlyField label="WABA ID" mono value={account.wabaId} />
					{account.phoneNumberId && (
						<ReadOnlyField
							label="Phone Number ID"
							mono
							value={account.phoneNumberId}
						/>
					)}
					<ReadOnlyField label="Phone Number" value={account.phoneNumber} />
					<ReadOnlyField label="Display Name" value={account.displayName} />
					<ReadOnlyField label="Provider" value={account.numberProvider} />
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

				<Separator />

				{/* Members section */}
				<div className="space-y-4">
					<Label className="text-sm">Members</Label>

					<div className="space-y-2">
						{members?.map((member) => (
							<div
								className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
								key={member.userId}
							>
								{member.image ? (
									<Image
										alt=""
										className="h-7 w-7 rounded-full"
										height={28}
										src={member.image}
										width={28}
									/>
								) : (
									<div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
										<User className="h-3.5 w-3.5" />
									</div>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate text-foreground text-sm leading-none">
										{member.name ?? "Unknown"}
									</p>
									{member.email && (
										<p className="mt-0.5 truncate text-muted-foreground text-xs">
											{member.email}
										</p>
									)}
								</div>

								{member.role === "owner" ? (
									<span className="flex shrink-0 items-center gap-1 rounded-md bg-pons-green-surface px-2 py-1 text-pons-green text-xs">
										<Crown className="h-3 w-3" />
										Owner
									</span>
								) : (
									<div className="relative flex shrink-0 items-center gap-1">
										<button
											className={cn(
												"flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
												member.role === "admin"
													? "bg-muted text-foreground"
													: "bg-muted text-muted-foreground",
												"hover:bg-accent",
											)}
											onClick={() =>
												setRoleDropdownOpen(
													roleDropdownOpen === member.userId
														? null
														: member.userId,
												)
											}
											type="button"
										>
											{member.role === "admin" ? (
												<Shield className="h-3 w-3" />
											) : (
												<User className="h-3 w-3" />
											)}
											{member.role === "admin" ? "Admin" : "Member"}
											<ChevronDown className="h-3 w-3" />
										</button>

										{roleDropdownOpen === member.userId && (
											<div className="absolute top-full right-0 z-10 mt-1 w-36 rounded-md border bg-popover p-1 shadow-md">
												<button
													className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
													onClick={() =>
														handleRoleChange(
															member.userId as Id<"users">,
															member.role === "admin" ? "member" : "admin",
														)
													}
													type="button"
												>
													{member.role === "admin" ? (
														<>
															<User className="h-3.5 w-3.5" />
															Make Member
														</>
													) : (
														<>
															<Shield className="h-3.5 w-3.5" />
															Make Admin
														</>
													)}
												</button>
												<button
													className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-destructive text-sm hover:bg-destructive/10"
													onClick={() =>
														handleRemoveMember(member.userId as Id<"users">)
													}
													type="button"
												>
													<Trash2 className="h-3.5 w-3.5" />
													Remove
												</button>
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>

					<form
						className="flex items-start gap-2"
						onSubmit={handleInviteByEmail}
					>
						<div className="min-w-0 flex-1 space-y-1">
							<div className="flex gap-2">
								<Input
									className="flex-1"
									onChange={(e) => {
										setInviteEmail(e.target.value);
										setInviteError(null);
									}}
									placeholder="Email address"
									type="email"
									value={inviteEmail}
								/>
								<select
									className="h-10 rounded-md border bg-muted px-2 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring"
									onChange={(e) =>
										setInviteRole(e.target.value as "admin" | "member")
									}
									value={inviteRole}
								>
									<option value="member">Member</option>
									<option value="admin">Admin</option>
								</select>
							</div>
							{inviteError && (
								<p className="text-destructive text-xs">{inviteError}</p>
							)}
						</div>
						<Button
							className="shrink-0 gap-1.5"
							disabled={inviting || !inviteEmail.trim()}
							size="default"
							type="submit"
							variant="secondary"
						>
							{inviting ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<UserPlus className="h-3.5 w-3.5" />
							)}
							Invite
						</Button>
					</form>
					<p className="text-muted-foreground text-xs">
						Users must have signed in at least once before they can be invited.
					</p>
				</div>
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
