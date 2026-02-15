"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
	ChevronDown,
	KeyRound,
	LogOut,
	MessageSquare,
	Plus,
	Settings,
} from "lucide-react";
import { useState } from "react";
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

export function Dashboard() {
	const { signOut } = useAuthActions();
	const accounts = useQuery(api.accounts.list);

	const [selectedAccountId, setSelectedAccountId] = useState<
		Id<"accounts"> | undefined
	>();
	const [selectedConversationId, setSelectedConversationId] = useState<
		Id<"conversations"> | undefined
	>();
	const [showSetup, setShowSetup] = useState(false);
	const [showApiKeys, setShowApiKeys] = useState(false);
	const [showSettings, setShowSettings] = useState(false);

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

	// Auto-select first account if only one exists
	if (accounts.length === 1 && !selectedAccountId && accounts[0]) {
		setSelectedAccountId(accounts[0]._id);
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

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col">
				{/* Header */}
				<header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2">
							<div className="flex h-7 w-7 items-center justify-center rounded-md bg-pons-green/10">
								<MessageSquare className="h-3.5 w-3.5 text-pons-green" />
							</div>
							<span className="font-display font-semibold text-sm tracking-tight">
								Pons
							</span>
						</div>
						<Separator className="!h-5" orientation="vertical" />
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
					</div>

					<div className="flex items-center gap-1">
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
					</div>
				</header>

				{/* Main content */}
				<div className="flex flex-1 overflow-hidden">
					{/* Conversation list sidebar */}
					<div className="w-80 shrink-0 overflow-y-auto border-r">
						{selectedAccountId ? (
							<ConversationList
								accountId={selectedAccountId}
								onSelectConversation={setSelectedConversationId}
								selectedConversationId={selectedConversationId}
							/>
						) : (
							<EmptyState
								description="Choose an account above to view conversations"
								icon={ChevronDown}
								title="Select an account"
							/>
						)}
					</div>

					{/* Message thread */}
					<div className="flex-1 overflow-hidden">
						{selectedAccountId && selectedConversationId ? (
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

function Header({ onSignOut }: { onSignOut: () => void }) {
	return (
		<header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
			<div className="flex items-center gap-2">
				<div className="flex h-7 w-7 items-center justify-center rounded-md bg-pons-green/10">
					<MessageSquare className="h-3.5 w-3.5 text-pons-green" />
				</div>
				<span className="font-display font-semibold text-sm tracking-tight">
					Pons
				</span>
			</div>
			<Button
				className="h-8 text-muted-foreground text-xs hover:text-foreground"
				onClick={onSignOut}
				size="sm"
				variant="ghost"
			>
				<LogOut className="mr-1.5 h-3.5 w-3.5" />
				Sign out
			</Button>
		</header>
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
