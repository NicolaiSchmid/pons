"use client";

import { useQuery } from "convex/react";
import { MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeDialog } from "@/components/ComposeDialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface ConversationListProps {
	accountId: Id<"accounts">;
	selectedConversationId?: Id<"conversations">;
}

export function ConversationList({
	accountId,
	selectedConversationId,
}: ConversationListProps) {
	const conversations = useQuery(api.conversations.list, { accountId });
	const [search, setSearch] = useState("");

	if (!conversations) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-xs">
						Loading conversations...
					</p>
				</div>
			</div>
		);
	}

	const filtered = search.trim()
		? conversations.filter(
				(c) =>
					c.contact?.name?.toLowerCase().includes(search.toLowerCase()) ||
					c.contact?.phone?.includes(search),
			)
		: conversations;

	return (
		<div className="flex h-full flex-col">
			{/* Search + New button */}
			<div className="flex shrink-0 items-center gap-1.5 px-2 py-1.5">
				<div className="relative flex-1">
					<Search className="absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
					<input
						className="h-7 w-full rounded-md bg-muted pr-2 pl-7 text-foreground text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search..."
						type="text"
						value={search}
					/>
				</div>
				<ComposeDialog accountId={accountId} />
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto">
				{filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 px-3 py-10">
						<MessageSquare className="h-4 w-4 text-muted-foreground" />
						<p className="text-muted-foreground text-xs">
							{search ? "No results" : "No conversations yet"}
						</p>
					</div>
				) : (
					filtered.map((conv) => {
						const name = conv.contact?.name ?? conv.contact?.phone ?? "Unknown";
						const hasUnread = conv.unreadCount > 0;

						return (
							<Link
								className={cn(
									"flex items-center gap-2 border-border/40 border-b px-2.5 py-1.5 transition-colors hover:bg-muted/50",
									selectedConversationId === conv._id && "bg-muted/70",
								)}
								href={`/dashboard/${accountId}/${conv._id}`}
								key={conv._id}
							>
								{/* Name / preview */}
								<div className="flex min-w-0 flex-1 items-baseline gap-1.5">
									<span
										className={cn(
											"shrink-0 truncate text-xs",
											hasUnread
												? "font-semibold text-foreground"
												: "font-medium text-foreground",
										)}
										style={{ maxWidth: "40%" }}
									>
										{name}
									</span>
									{conv.lastMessagePreview && (
										<span className="truncate text-[11px] text-muted-foreground">
											{conv.lastMessagePreview}
										</span>
									)}
								</div>

								{/* Timestamp + badge */}
								<div className="flex shrink-0 items-center gap-1.5">
									{conv.lastMessageAt && (
										<span className="text-[10px] text-muted-foreground">
											{formatRelativeTime(conv.lastMessageAt)}
										</span>
									)}
									{hasUnread && (
										<Badge
											className="h-4 min-w-4 justify-center rounded-full bg-pons-accent px-1 font-medium text-[9px] text-pons-accent-foreground hover:bg-pons-accent"
											variant="default"
										>
											{conv.unreadCount}
										</Badge>
									)}
								</div>
							</Link>
						);
					})
				)}
			</div>
		</div>
	);
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	if (hours < 24) return `${hours}h`;
	if (days < 7) return `${days}d`;
	return new Date(timestamp).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
