"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AccountSelector } from "./AccountSelector";
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

	// Loading state
	if (accounts === undefined) {
		return (
			<div className="flex h-screen items-center justify-center bg-slate-900">
				<div className="text-slate-400">Loading...</div>
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
			<div className="flex min-h-screen flex-col bg-slate-900">
				<header className="flex items-center justify-between border-slate-700 border-b px-6 py-4">
					<h1 className="font-bold text-emerald-400 text-xl">Pons</h1>
					<button
						className="text-slate-400 text-sm hover:text-slate-200"
						onClick={() => void signOut()}
						type="button"
					>
						Sign out
					</button>
				</header>
				<SetupAccount
					onComplete={() => {
						setShowSetup(false);
					}}
				/>
			</div>
		);
	}

	return (
		<div className="flex h-screen flex-col bg-slate-900">
			{/* Header */}
			<header className="flex items-center justify-between border-slate-700 border-b px-6 py-4">
				<div className="flex items-center gap-4">
					<h1 className="font-bold text-emerald-400 text-xl">Pons</h1>
					<AccountSelector
						onSelectAccount={setSelectedAccountId}
						selectedAccountId={selectedAccountId}
					/>
				</div>
				<div className="flex items-center gap-4">
					<button
						className="text-slate-400 text-sm hover:text-slate-200"
						onClick={() => setShowSetup(true)}
						type="button"
					>
						+ Add Account
					</button>
					<button
						className="text-slate-400 text-sm hover:text-slate-200"
						onClick={() => void signOut()}
						type="button"
					>
						Sign out
					</button>
				</div>
			</header>

			{/* Main content */}
			<div className="flex flex-1 overflow-hidden">
				{/* Conversation list sidebar */}
				<div className="w-80 overflow-y-auto border-slate-700 border-r">
					{selectedAccountId ? (
						<ConversationList
							accountId={selectedAccountId}
							onSelectConversation={setSelectedConversationId}
							selectedConversationId={selectedConversationId}
						/>
					) : (
						<div className="flex h-full items-center justify-center p-4">
							<div className="text-center text-slate-500">
								Select an account to view conversations
							</div>
						</div>
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
						<div className="flex h-full items-center justify-center">
							<div className="text-center text-slate-500">
								{selectedAccountId
									? "Select a conversation to view messages"
									: "Select an account to get started"}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
