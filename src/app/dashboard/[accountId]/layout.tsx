"use client";

import { useQuery } from "convex/react";
import { AlertCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { ConversationList } from "@/components/ConversationList";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

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

export default function AccountLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;
	const conversationId = params.conversationId as
		| Id<"conversations">
		| undefined;
	const accounts = useQuery(api.accounts.list);
	const selectedAccount = accounts?.find((a) => a?._id === accountId);
	const isUsable = selectedAccount
		? USABLE_STATUSES.has(selectedAccount.status)
		: false;

	return (
		<div className="flex flex-1 overflow-hidden">
			{/* Conversation list sidebar */}
			<div className="flex w-80 shrink-0 flex-col border-r">
				<div className="flex-1 overflow-y-auto">
					{isUsable ? (
						<ConversationList
							accountId={accountId}
							selectedConversationId={conversationId}
						/>
					) : (
						<EmptyState
							description="This account isn't ready for messaging yet"
							icon={AlertCircle}
							title="Account not ready"
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

			{/* Right pane */}
			<div className="flex-1 overflow-hidden">{children}</div>
		</div>
	);
}
