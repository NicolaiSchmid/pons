"use client";

import { useQuery } from "convex/react";
import { AlertCircle, FileText, MessageSquare, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { ConversationList } from "@/components/ConversationList";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

const NAV_ITEMS = [
	{ href: "", icon: MessageSquare, label: "Conversations" },
	{ href: "/templates", icon: FileText, label: "Templates" },
	{ href: "/settings", icon: Settings, label: "Settings" },
] as const;

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
	const pathname = usePathname();
	const accountId = params.accountId as Id<"accounts">;
	const conversationId = params.conversationId as
		| Id<"conversations">
		| undefined;
	const accounts = useQuery(api.accounts.list);
	const selectedAccount = accounts?.find((a) => a?._id === accountId);
	const isUsable = selectedAccount
		? USABLE_STATUSES.has(selectedAccount.status)
		: false;

	const basePath = `/dashboard/${accountId}`;
	const SUB_PAGES = ["/templates", "/settings"];
	const isConversationsView = !SUB_PAGES.some((p) =>
		pathname.startsWith(`${basePath}${p}`),
	);

	return (
		<div className="flex flex-1 overflow-hidden">
			{/* Sidebar */}
			<div className="flex w-80 shrink-0 flex-col border-r">
				{/* Nav tabs */}
				<nav className="flex shrink-0 gap-1 border-b px-3 py-2">
					{NAV_ITEMS.map(({ href, icon: Icon, label }) => {
						const fullHref = `${basePath}${href}`;
						const isActive =
							href === "" ? isConversationsView : pathname.startsWith(fullHref);

						return (
							<Link
								className={cn(
									"flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition",
									isActive
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
								)}
								href={fullHref}
								key={href}
							>
								<Icon className="h-3.5 w-3.5" />
								<span className="hidden lg:inline">{label}</span>
							</Link>
						);
					})}
				</nav>

				{/* Conversation list (only when on conversations view) */}
				<div className="flex-1 overflow-y-auto">
					{isConversationsView ? (
						isUsable ? (
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
						)
					) : null}
				</div>

				{/* Footer links */}
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
