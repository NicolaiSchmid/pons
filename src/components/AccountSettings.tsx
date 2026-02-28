"use client";

import { type Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	Check,
	ChevronDown,
	Clock,
	Crown,
	ExternalLink,
	Link2,
	Loader2,
	RefreshCcw,
	Settings,
	Shield,
	Trash2,
	User,
	UserPlus,
	XCircle,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AccountSettingsPreloadedProps {
	accountId: Id<"accounts">;
	preloadedAccount: Preloaded<typeof api.accounts.get>;
	preloadedMembers: Preloaded<typeof api.accounts.listMembers>;
	preloadedWebhookTargets: Preloaded<typeof api.webhookTargets.listByAccount>;
}

type WebhookTargetItem = FunctionReturnType<
	typeof api.webhookTargets.listByAccount
>[number];

const WEBHOOK_EVENT_OPTIONS = [
	{ key: "message.inbound.received", label: "Inbound messages" },
	{ key: "message.outbound.sent", label: "Outbound sent" },
	{ key: "message.outbound.failed", label: "Outbound failed" },
	{ key: "message.status.updated", label: "Status updates" },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
	adding_number: { label: "Adding number", color: "text-yellow-600" },
	code_requested: { label: "Awaiting code", color: "text-yellow-600" },
	verifying_code: { label: "Verifying", color: "text-yellow-600" },
	registering: { label: "Registering", color: "text-yellow-600" },
	pending_name_review: {
		label: "Name under review",
		color: "text-yellow-600",
	},
	active: { label: "Active", color: "text-emerald-600" },
	name_declined: { label: "Name declined", color: "text-red-400" },
	failed: { label: "Failed", color: "text-red-400" },
};

/** SSR version: uses usePreloadedQuery for instant render with real-time takeover */
export function AccountSettingsPreloaded({
	accountId,
	preloadedAccount,
	preloadedMembers,
	preloadedWebhookTargets,
}: AccountSettingsPreloadedProps) {
	const account = usePreloadedQuery(preloadedAccount);
	const members = usePreloadedQuery(preloadedMembers);
	const webhookTargets = usePreloadedQuery(preloadedWebhookTargets);

	if (!account) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-muted-foreground text-sm">Account not found</p>
			</div>
		);
	}

	return (
		<AccountSettingsContent
			account={account}
			accountId={accountId}
			members={members ?? []}
			webhookTargets={webhookTargets ?? []}
		/>
	);
}

/** Shared rendering logic */
function AccountSettingsContent({
	accountId,
	account,
	members,
	webhookTargets,
}: {
	accountId: Id<"accounts">;
	account: NonNullable<FunctionReturnType<typeof api.accounts.get>>;
	members: FunctionReturnType<typeof api.accounts.listMembers>;
	webhookTargets: FunctionReturnType<typeof api.webhookTargets.listByAccount>;
}) {
	const updateAccount = useMutation(api.accounts.update);
	const deleteAccount = useMutation(api.accounts.remove);
	const addMemberByEmail = useMutation(api.accounts.addMemberByEmail);
	const removeMember = useMutation(api.accounts.removeMember);
	const updateRole = useMutation(api.accounts.updateMemberRole);
	const createWebhookTarget = useMutation(api.webhookTargets.create);
	const updateWebhookTarget = useMutation(api.webhookTargets.update);
	const removeWebhookTarget = useMutation(api.webhookTargets.remove);
	const rotateWebhookSecret = useMutation(api.webhookTargets.rotateSecret);
	const router = useRouter();

	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
	const [inviting, setInviting] = useState(false);
	const [inviteError, setInviteError] = useState<string | null>(null);
	const [roleDropdownOpen, setRoleDropdownOpen] = useState<string | null>(null);
	const [newTargetName, setNewTargetName] = useState("Primary webhook");
	const [newTargetUrl, setNewTargetUrl] = useState("");
	const [newTargetEvents, setNewTargetEvents] = useState<string[]>(
		WEBHOOK_EVENT_OPTIONS.map((event) => event.key),
	);
	const [creatingTarget, setCreatingTarget] = useState(false);
	const [webhookError, setWebhookError] = useState<string | null>(null);
	const [editingTargetId, setEditingTargetId] =
		useState<Id<"webhookTargets"> | null>(null);
	const [editingTargetEvents, setEditingTargetEvents] = useState<string[]>([]);
	const [updatingTargetEvents, setUpdatingTargetEvents] = useState(false);

	const [formData, setFormData] = useState({
		name: "",
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Only populate when account data arrives
	useEffect(() => {
		if (account) {
			setFormData({
				name: account.name,
			});
		}
	}, [account?._id]);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		setError(null);
		setSaved(false);

		try {
			await updateAccount({
				accountId,
				name: formData.name,
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

	const toggleEvent = (eventKey: string) => {
		setNewTargetEvents((prev) =>
			prev.includes(eventKey)
				? prev.filter((value) => value !== eventKey)
				: [...prev, eventKey],
		);
	};

	const toggleEditingTargetEvent = (eventKey: string) => {
		setEditingTargetEvents((prev) =>
			prev.includes(eventKey)
				? prev.filter((value) => value !== eventKey)
				: [...prev, eventKey],
		);
	};

	const handleCreateTarget = async (e: React.FormEvent) => {
		e.preventDefault();
		setWebhookError(null);
		if (!newTargetUrl.trim()) {
			setWebhookError("Webhook URL is required");
			return;
		}
		if (newTargetEvents.length === 0) {
			setWebhookError("Select at least one event type");
			return;
		}

		setCreatingTarget(true);
		try {
			const result = await createWebhookTarget({
				accountId,
				name: newTargetName.trim() || "Webhook target",
				url: newTargetUrl.trim(),
				subscribedEvents: newTargetEvents as Array<
					| "message.inbound.received"
					| "message.outbound.sent"
					| "message.outbound.failed"
					| "message.status.updated"
				>,
			});
			setNewTargetUrl("");
			setNewTargetName("Primary webhook");
			setNewTargetEvents(WEBHOOK_EVENT_OPTIONS.map((event) => event.key));
			toast.success("Webhook target created", {
				description: `Signing secret: ${result.signingSecret}`,
			});
		} catch (err) {
			setWebhookError(
				err instanceof Error ? err.message : "Failed to create webhook target",
			);
		} finally {
			setCreatingTarget(false);
		}
	};

	const handleToggleTarget = async (
		targetId: Id<"webhookTargets">,
		enabled: boolean,
	) => {
		setWebhookError(null);
		try {
			await updateWebhookTarget({ targetId, enabled: !enabled });
		} catch (err) {
			setWebhookError(
				err instanceof Error ? err.message : "Failed to update webhook target",
			);
		}
	};

	const handleRotateSecret = async (targetId: Id<"webhookTargets">) => {
		setWebhookError(null);
		try {
			const result = await rotateWebhookSecret({ targetId });
			toast.success("Signing secret rotated", {
				description: `New secret: ${result.signingSecret}`,
			});
		} catch (err) {
			setWebhookError(
				err instanceof Error ? err.message : "Failed to rotate signing secret",
			);
		}
	};

	const handleDeleteTarget = async (targetId: Id<"webhookTargets">) => {
		setWebhookError(null);
		try {
			await removeWebhookTarget({ targetId });
			if (editingTargetId === targetId) {
				setEditingTargetId(null);
				setEditingTargetEvents([]);
			}
			toast.success("Webhook target deleted");
		} catch (err) {
			setWebhookError(
				err instanceof Error ? err.message : "Failed to delete webhook target",
			);
		}
	};

	const handleStartEditingTargetEvents = (target: WebhookTargetItem) => {
		setWebhookError(null);
		setEditingTargetId(target._id as Id<"webhookTargets">);
		setEditingTargetEvents([...target.subscribedEvents]);
	};

	const handleCancelEditingTargetEvents = () => {
		setEditingTargetId(null);
		setEditingTargetEvents([]);
	};

	const handleSaveTargetEvents = async (targetId: Id<"webhookTargets">) => {
		setWebhookError(null);
		if (editingTargetEvents.length === 0) {
			setWebhookError("Select at least one event type");
			return;
		}

		setUpdatingTargetEvents(true);
		try {
			await updateWebhookTarget({
				targetId,
				subscribedEvents: editingTargetEvents as Array<
					| "message.inbound.received"
					| "message.outbound.sent"
					| "message.outbound.failed"
					| "message.status.updated"
				>,
			});
			setEditingTargetId(null);
			setEditingTargetEvents([]);
			toast.success("Webhook events updated");
		} catch (err) {
			setWebhookError(
				err instanceof Error ? err.message : "Failed to update webhook events",
			);
		} finally {
			setUpdatingTargetEvents(false);
		}
	};

	const statusInfo = STATUS_LABELS[account.status] ?? {
		label: account.status,
		color: "text-muted-foreground",
	};

	return (
		<div className="mx-auto h-full max-w-lg overflow-y-auto p-6">
			<div className="mb-6">
				<h1 className="flex items-center gap-2 font-display font-semibold text-lg">
					<Settings className="h-4 w-4 text-pons-accent" />
					Account Settings
				</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					View and update your WhatsApp Business account configuration.
				</p>
			</div>

			<div className="space-y-6">
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
					<div className="flex items-start gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600">
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
					<ReadOnlyField
						href={`https://business.facebook.com/latest/whatsapp_manager/phone_numbers?asset_id=${account.wabaId}`}
						label="Phone Number"
						value={account.phoneNumber}
					/>
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

					{error && (
						<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
							{error}
						</div>
					)}

					<Button
						className="w-full bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
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
									<span className="flex shrink-0 items-center gap-1 rounded-md bg-pons-accent-surface px-2 py-1 text-pons-accent text-xs">
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

				<Separator />

				<div className="space-y-4">
					<p className="font-medium text-sm">Webhook Forwarding</p>
					<p className="text-muted-foreground text-xs">
						Forward inbound and outbound events for this number to external
						webhook targets. Retries are automatic on non-200 responses.
					</p>

					<div className="space-y-2">
						{webhookTargets.length === 0 ? (
							<div className="rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground text-xs">
								No webhook targets configured yet.
							</div>
						) : (
							webhookTargets.map((target: WebhookTargetItem) => (
								<div
									className="space-y-2 rounded-lg border bg-card px-3 py-3"
									key={target._id}
								>
									<div className="flex items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="truncate font-medium text-sm">
												{target.name}
											</p>
											<p className="truncate font-mono text-muted-foreground text-xs">
												{target.url}
											</p>
										</div>
										<button
											className={cn(
												"rounded-md px-2 py-1 text-xs",
												target.enabled
													? "bg-emerald-500/10 text-emerald-600"
													: "bg-muted text-muted-foreground",
											)}
											onClick={() =>
												handleToggleTarget(
													target._id as Id<"webhookTargets">,
													target.enabled,
												)
											}
											type="button"
										>
											{target.enabled ? "Enabled" : "Disabled"}
										</button>
									</div>

									<div className="flex flex-wrap gap-1.5">
										{target.subscribedEvents.map((event: string) => (
											<span
												className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]"
												key={event}
											>
												{event}
											</span>
										))}
									</div>

									<div className="grid gap-1 text-[11px] text-muted-foreground">
										<span>
											Secret:{" "}
											<span className="font-mono">
												{target.signingSecretPreview}
											</span>
										</span>
										<span>
											Attempts/timeout: {target.maxAttempts} /{" "}
											{target.timeoutMs}ms
										</span>
										{target.lastSuccessAt && (
											<span>
												Last success:{" "}
												{new Date(target.lastSuccessAt).toLocaleString()}
											</span>
										)}
										{target.lastFailureAt && (
											<span>
												Last failure:{" "}
												{new Date(target.lastFailureAt).toLocaleString()} (
												{target.consecutiveFailures} consecutive)
											</span>
										)}
									</div>

									<div className="flex gap-2">
										<Button
											onClick={() => handleStartEditingTargetEvents(target)}
											size="sm"
											type="button"
											variant="outline"
										>
											Edit events
										</Button>
										<Button
											onClick={() =>
												handleRotateSecret(target._id as Id<"webhookTargets">)
											}
											size="sm"
											variant="secondary"
										>
											<RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
											Rotate secret
										</Button>
										<Button
											onClick={() =>
												handleDeleteTarget(target._id as Id<"webhookTargets">)
											}
											size="sm"
											variant="destructive"
										>
											<Trash2 className="mr-1.5 h-3.5 w-3.5" />
											Delete
										</Button>
									</div>

									{editingTargetId === target._id && (
										<div className="space-y-2 rounded-md border bg-muted/30 p-2">
											<p className="font-medium text-xs">
												Edit subscribed events
											</p>
											<div className="grid gap-1.5">
												{WEBHOOK_EVENT_OPTIONS.map(
													(event: (typeof WEBHOOK_EVENT_OPTIONS)[number]) => (
														<div
															className="flex items-center gap-2 text-xs"
															key={event.key}
														>
															<Checkbox
																checked={editingTargetEvents.includes(
																	event.key,
																)}
																onCheckedChange={() =>
																	toggleEditingTargetEvent(event.key)
																}
															/>
															<span>{event.label}</span>
														</div>
													),
												)}
											</div>
											<div className="flex gap-2">
												<Button
													disabled={updatingTargetEvents}
													onClick={() =>
														handleSaveTargetEvents(
															target._id as Id<"webhookTargets">,
														)
													}
													size="sm"
													type="button"
													variant="secondary"
												>
													{updatingTargetEvents && (
														<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
													)}
													Save events
												</Button>
												<Button
													disabled={updatingTargetEvents}
													onClick={handleCancelEditingTargetEvents}
													size="sm"
													type="button"
													variant="ghost"
												>
													Cancel
												</Button>
											</div>
										</div>
									)}
								</div>
							))
						)}
					</div>

					<form
						className="space-y-3 rounded-lg border bg-card p-3"
						onSubmit={handleCreateTarget}
					>
						<div className="grid gap-2">
							<Label htmlFor="webhook-target-name">Target name</Label>
							<Input
								id="webhook-target-name"
								onChange={(e) => setNewTargetName(e.target.value)}
								placeholder="Primary webhook"
								value={newTargetName}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="webhook-target-url">Target URL</Label>
							<Input
								id="webhook-target-url"
								onChange={(e) => setNewTargetUrl(e.target.value)}
								placeholder="https://example.com/webhooks/pons"
								value={newTargetUrl}
							/>
						</div>

						<div className="grid gap-2">
							<p className="font-medium text-xs">Events</p>
							<div className="grid gap-1.5">
								{WEBHOOK_EVENT_OPTIONS.map(
									(event: (typeof WEBHOOK_EVENT_OPTIONS)[number]) => (
										<div
											className="flex items-center gap-2 text-xs"
											key={event.key}
										>
											<Checkbox
												checked={newTargetEvents.includes(event.key)}
												onCheckedChange={() => toggleEvent(event.key)}
											/>
											<span>{event.label}</span>
										</div>
									),
								)}
							</div>
						</div>

						{webhookError && (
							<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
								{webhookError}
							</div>
						)}

						<Button disabled={creatingTarget} type="submit" variant="secondary">
							{creatingTarget ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<Link2 className="mr-2 h-4 w-4" />
							)}
							Add webhook target
						</Button>
					</form>
				</div>

				<Separator />

				{/* Danger zone */}
				<div className="space-y-3">
					<Label className="text-destructive text-sm">Danger Zone</Label>
					<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="font-medium text-foreground text-sm">
									Delete account
								</p>
								<p className="mt-0.5 text-muted-foreground text-xs">
									Permanently delete this account, all conversations, messages,
									and contacts. This cannot be undone.
								</p>
							</div>
							<Dialog
								onOpenChange={setDeleteDialogOpen}
								open={deleteDialogOpen}
							>
								<DialogTrigger asChild>
									<Button
										className="shrink-0 gap-1.5"
										size="sm"
										variant="destructive"
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Delete account</DialogTitle>
										<DialogDescription>
											This will permanently delete{" "}
											<span className="font-medium text-foreground">
												{account.name}
											</span>{" "}
											({account.phoneNumber}) and all associated data including
											conversations, messages, contacts, and API keys. This
											action cannot be undone.
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<DialogClose asChild>
											<Button variant="outline">Cancel</Button>
										</DialogClose>
										<Button
											disabled={deleting}
											onClick={async () => {
												setDeleting(true);
												try {
													await deleteAccount({ accountId });
													setDeleteDialogOpen(false);
													toast.success("Account deleted");
													router.push("/dashboard");
												} catch (err) {
													setError(
														err instanceof Error
															? err.message
															: "Failed to delete account",
													);
													setDeleting(false);
												}
											}}
											variant="destructive"
										>
											{deleting ? (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											) : (
												<Trash2 className="mr-2 h-4 w-4" />
											)}
											Delete permanently
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function ReadOnlyField({
	label,
	value,
	mono,
	href,
}: {
	label: string;
	value: string;
	mono?: boolean;
	href?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="shrink-0 text-muted-foreground text-xs">{label}</span>
			{href ? (
				<a
					className={`inline-flex items-center gap-1 truncate text-pons-accent text-xs underline underline-offset-2 hover:text-pons-accent-bright ${mono ? "font-mono" : ""}`}
					href={href}
					rel="noopener noreferrer"
					target="_blank"
				>
					{value}
					<ExternalLink className="h-3 w-3 shrink-0" />
				</a>
			) : (
				<span
					className={`truncate text-foreground text-xs ${mono ? "font-mono" : ""}`}
				>
					{value}
				</span>
			)}
		</div>
	);
}
