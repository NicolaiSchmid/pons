"use client";

import { useQuery } from "convex/react";
import { MessageSquare, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeDialog } from "@/components/ComposeDialog";
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
			{/* Search */}
			<div className="px-3 pt-2 pb-1">
				<div className="relative">
					<Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
					<input
						className="h-8 w-full rounded-lg bg-sidebar-accent/60 pr-3 pl-8 text-[13px] text-foreground transition-colors placeholder:text-muted-foreground/50 focus:bg-sidebar-accent focus:outline-none focus:ring-1 focus:ring-sidebar-border"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search Chats"
						type="text"
						value={search}
					/>
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto pt-1">
				{filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 px-3 py-12">
						<MessageSquare className="h-5 w-5 text-muted-foreground/40" />
						<p className="text-muted-foreground/60 text-xs">
							{search ? "No results" : "No conversations yet"}
						</p>
					</div>
				) : (
					filtered.map((conv) => {
						const name = conv.contact?.name ?? conv.contact?.phone ?? "Unknown";
						const isSelected = selectedConversationId === conv._id;
						const hasUnread = conv.unreadCount > 0;

						return (
							<Link
								className={cn(
									"group flex items-start gap-3 px-3 py-2.5 transition-colors",
									isSelected
										? "bg-sidebar-accent"
										: "hover:bg-sidebar-accent/50",
								)}
								href={`/dashboard/${accountId}/${conv._id}`}
								key={conv._id}
							>
								{/* Content — two-line layout */}
								<div className="min-w-0 flex-1">
									{/* Row 1: Name + timestamp */}
									<div className="flex items-baseline justify-between gap-2">
										<span
											className={cn(
												"truncate text-[13px] leading-tight",
												hasUnread
													? "font-semibold text-foreground"
													: "font-medium text-sidebar-foreground",
											)}
										>
											{name}
										</span>
										{conv.lastMessageAt && (
											<span
												className={cn(
													"shrink-0 text-[11px] tabular-nums",
													hasUnread
														? "font-medium text-pons-accent"
														: "text-muted-foreground/60",
												)}
											>
												{formatRelativeTime(conv.lastMessageAt)}
											</span>
										)}
									</div>

									{/* Row 2: Preview + unread badge */}
									<div className="mt-0.5 flex items-center justify-between gap-2">
										{conv.lastMessagePreview ? (
											<span
												className={cn(
													"truncate text-xs leading-relaxed",
													hasUnread
														? "text-sidebar-foreground/70"
														: "text-muted-foreground/50",
												)}
											>
												{conv.lastMessagePreview}
											</span>
										) : (
											<span />
										)}
										{hasUnread && (
											<span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-pons-accent px-1 font-semibold text-[10px] text-pons-accent-foreground">
												{conv.unreadCount}
											</span>
										)}
									</div>
								</div>
							</Link>
						);
					})
				)}
			</div>

			{/* Compose button — pinned to bottom of list area */}
			<div className="shrink-0 border-sidebar-border border-t px-3 py-2">
				<ComposeDialog
					accountId={accountId}
					trigger={
						<button
							className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
							type="button"
						>
							<Plus className="h-4 w-4" />
							<span>New Conversation</span>
						</button>
					}
				/>
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
