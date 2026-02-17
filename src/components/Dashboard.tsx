"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import {
	AlertCircle,
	ChevronDown,
	Clock,
	KeyRound,
	LogOut,
	MessageSquare,
	Plus,
	RefreshCw,
	Settings,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AccountSelector } from "./AccountSelector";
import { AccountSettings } from "./AccountSettings";
import { ApiKeyManager } from "./ApiKeyManager";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { SetupAccount } from "./SetupAccount";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

export function Dashboard() {
	const { signOut } = useAuthActions();
	const accounts = useQuery(api.accounts.list);
	const retryFromFailed = useMutation(api.accounts.retryFromFailed);

	const [selectedAccountId, setSelectedAccountId] = useState<
		Id<"accounts"> | undefined
	>();
	const [selectedConversationId, setSelectedConversationId] = useState<
		Id<"conversations"> | undefined
	>();
	const [showSetup, setShowSetup] = useState(false);
	const [showApiKeys, setShowApiKeys] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [retrying, setRetrying] = useState(false);

	// Loading state
	if (accounts === undefined) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</div>
		);
	}

	// Auto-select: prefer active accounts, fall back to first
	if (accounts.length >= 1 && !selectedAccountId) {
		const active = accounts.find((a) => a && USABLE_STATUSES.has(a.status));
		const first = active ?? accounts[0];
		if (first) {
			setSelectedAccountId(first._id);
		}
	}

	// No accounts - show setup
	if (accounts.length === 0 || showSetup) {
		return (
			<div className="flex min-h-screen flex-col">
				<Header onSignOut={() => void signOut()} />
				<SetupAccount
					onComplete={() => {
						setShowSetup(false);
					}}
				/>
			</div>
		);
	}

	const selectedAccount = accounts.find((a) => a?._id === selectedAccountId);
	const isUsable = selectedAccount
		? USABLE_STATUSES.has(selectedAccount.status)
		: false;

	const handleRetry = async () => {
		if (!selectedAccountId) return;
		setRetrying(true);
		try {
			await retryFromFailed({ accountId: selectedAccountId });
		} catch {
			// Error will surface via reactive query
		} finally {
			setRetrying(false);
		}
	};

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col">
				{/* Header */}
				<Navbar hideNav>
					<AccountSelector
						onSelectAccount={setSelectedAccountId}
						selectedAccountId={selectedAccountId}
					/>
					{selectedAccountId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									className="h-7 w-7 text-muted-foreground hover:text-foreground"
									onClick={() => setShowSettings(true)}
									size="icon"
									variant="ghost"
								>
									<Settings className="h-3.5 w-3.5" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Account settings</TooltipContent>
						</Tooltip>
					)}
					<Separator className="!h-5 mx-1" orientation="vertical" />
					{selectedAccountId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									className="h-8 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
									onClick={() => setShowApiKeys(true)}
									size="sm"
									variant="ghost"
								>
									<KeyRound className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">API Keys</span>
								</Button>
							</TooltipTrigger>
							<TooltipContent>Manage MCP API keys</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								className="h-8 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
								onClick={() => setShowSetup(true)}
								size="sm"
								variant="ghost"
							>
								<Plus className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Add Account</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Connect a WhatsApp account</TooltipContent>
					</Tooltip>
					<Separator className="!h-5 mx-1" orientation="vertical" />
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								className="h-8 w-8 text-muted-foreground hover:text-foreground"
								onClick={() => void signOut()}
								size="icon"
								variant="ghost"
							>
								<LogOut className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Sign out</TooltipContent>
					</Tooltip>
				</Navbar>

				{/* Main content */}
				<div className="flex flex-1 overflow-hidden">
					{/* Conversation list sidebar */}
					<div className="flex w-80 shrink-0 flex-col border-r">
						<div className="flex-1 overflow-y-auto">
							{selectedAccountId && isUsable ? (
								<ConversationList
									accountId={selectedAccountId}
									onSelectConversation={setSelectedConversationId}
									selectedConversationId={selectedConversationId}
								/>
							) : (
								<EmptyState
									description={
										selectedAccountId
											? "This account isn't ready for messaging yet"
											: "Choose an account above to view conversations"
									}
									icon={selectedAccountId ? AlertCircle : ChevronDown}
									title={
										selectedAccountId
											? "Account not ready"
											: "Select an account"
									}
								/>
							)}
						</div>
						<div className="flex shrink-0 gap-3 px-4 py-3">
							<a
								className="text-[11px] text-muted-foreground underline transition hover:text-foreground"
								href="/docs"
							>
								Docs
							</a>
							<a
								className="text-[11px] text-muted-foreground underline transition hover:text-foreground"
								href="/imprint"
							>
								Imprint
							</a>
							<a
								className="text-[11px] text-muted-foreground underline transition hover:text-foreground"
								href="/privacy"
							>
								Privacy
							</a>
						</div>
					</div>

					{/* Message thread / status banner */}
					<div className="flex-1 overflow-hidden">
						{selectedAccount && !isUsable ? (
							<AccountStatusBanner
								account={selectedAccount}
								onOpenSettings={() => setShowSettings(true)}
								onRetry={handleRetry}
								retrying={retrying}
							/>
						) : selectedAccountId && selectedConversationId ? (
							<MessageThread
								accountId={selectedAccountId}
								conversationId={selectedConversationId}
							/>
						) : (
							<EmptyState
								description={
									selectedAccountId
										? "Select a conversation from the sidebar"
										: "Select an account to view your messages"
								}
								icon={MessageSquare}
								title={
									selectedAccountId ? "No conversation selected" : "Get started"
								}
							/>
						)}
					</div>
				</div>

				{/* Modals */}
				{showApiKeys && selectedAccountId && (
					<ApiKeyManager
						accountId={selectedAccountId}
						onClose={() => setShowApiKeys(false)}
					/>
				)}
				{showSettings && selectedAccountId && (
					<AccountSettings
						accountId={selectedAccountId}
						onClose={() => setShowSettings(false)}
					/>
				)}
			</div>
		</TooltipProvider>
	);
}

// ── Status banner for non-usable accounts ──

type StrippedAccount = {
	_id: Id<"accounts">;
	_creationTime: number;
	name: string;
	wabaId: string;
	phoneNumberId?: string;
	phoneNumber: string;
	displayName: string;
	status: string;
	numberProvider: string;
	ownerId: Id<"users">;
	failedAtStep?: string;
	failedError?: string;
	failedAt?: number;
	nameReviewCheckCount?: number;
};

function AccountStatusBanner({
	account,
	onRetry,
	onOpenSettings,
	retrying,
}: {
	account: StrippedAccount;
	onRetry: () => void;
	onOpenSettings: () => void;
	retrying: boolean;
}) {
	const { status } = account;

	// Failed state — show error + retry
	if (status === "failed") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
					<XCircle className="h-6 w-6 text-destructive" />
				</div>
				<div className="text-center">
					<p className="font-display font-semibold text-foreground">
						Setup Failed
					</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						{account.failedError ?? "An error occurred during setup."}
					</p>
					{account.failedAtStep && (
						<p className="mt-1 text-muted-foreground text-xs">
							Failed at:{" "}
							<span className="font-mono">
								{account.failedAtStep.replace(/_/g, " ")}
							</span>
						</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button
						className="gap-1.5 bg-pons-green text-primary-foreground hover:bg-pons-green-bright"
						disabled={retrying}
						onClick={onRetry}
						size="sm"
					>
						{retrying ? (
							<RefreshCw className="h-3.5 w-3.5 animate-spin" />
						) : (
							<RefreshCw className="h-3.5 w-3.5" />
						)}
						Retry
					</Button>
					<Button
						className="gap-1.5"
						onClick={onOpenSettings}
						size="sm"
						variant="outline"
					>
						<Settings className="h-3.5 w-3.5" />
						Details
					</Button>
				</div>
			</div>
		);
	}

	// Name declined
	if (status === "name_declined") {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
					<XCircle className="h-6 w-6 text-destructive" />
				</div>
				<div className="text-center">
					<p className="font-display font-semibold text-foreground">
						Display Name Declined
					</p>
					<p className="mt-1 max-w-sm text-muted-foreground text-sm">
						Meta rejected the display name{" "}
						<span className="font-medium text-foreground">
							"{account.displayName}"
						</span>
						. You'll need to submit a new name via{" "}
						<a
							className="text-pons-green underline underline-offset-2 hover:text-pons-green-bright"
							href="https://business.facebook.com/settings/whatsapp-business-accounts"
							rel="noopener noreferrer"
							target="_blank"
						>
							Meta Business Suite
						</a>
						.
					</p>
				</div>
				<Button
					className="gap-1.5"
					onClick={onOpenSettings}
					size="sm"
					variant="outline"
				>
					<Settings className="h-3.5 w-3.5" />
					View Details
				</Button>
			</div>
		);
	}

	// In-progress states (adding_number, code_requested, verifying_code, registering)
	const IN_PROGRESS_LABELS: Record<string, string> = {
		adding_number: "Adding phone number to your WABA...",
		code_requested: "Verification code sent — waiting for entry",
		verifying_code: "Verifying your code...",
		registering: "Registering with WhatsApp...",
	};

	const progressLabel =
		IN_PROGRESS_LABELS[status] ?? "Setting up your account...";

	return (
		<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
			<div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
				<Clock className="h-6 w-6 animate-pulse text-yellow-400" />
			</div>
			<div className="text-center">
				<p className="font-display font-semibold text-foreground">
					Setup in Progress
				</p>
				<p className="mt-1 max-w-sm text-muted-foreground text-sm">
					{progressLabel}
				</p>
			</div>
			<Button
				className="gap-1.5"
				onClick={onOpenSettings}
				size="sm"
				variant="outline"
			>
				<Settings className="h-3.5 w-3.5" />
				View Details
			</Button>
		</div>
	);
}

// ── Shared layout components ──

function Header({ onSignOut }: { onSignOut: () => void }) {
	return (
		<Navbar hideNav>
			<Button
				className="h-8 text-muted-foreground text-xs hover:text-foreground"
				onClick={onSignOut}
				size="sm"
				variant="ghost"
			>
				<LogOut className="mr-1.5 h-3.5 w-3.5" />
				Sign out
			</Button>
		</Navbar>
	);
}

function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-8">
			<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<Icon className="h-5 w-5 text-muted-foreground" />
			</div>
			<div className="text-center">
				<p className="font-medium text-foreground text-sm">{title}</p>
				<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
			</div>
		</div>
	);
}
