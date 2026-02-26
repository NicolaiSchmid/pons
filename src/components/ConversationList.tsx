"use client";

import { type Preloaded, useMutation, usePreloadedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	Archive,
	ArchiveRestore,
	MessageSquare,
	MoreHorizontal,
	Plus,
	Search,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ComposeDialog } from "@/components/ComposeDialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface ConversationListPreloadedProps {
	accountId: Id<"accounts">;
	selectedConversationId?: Id<"conversations">;
	preloadedConversations: Preloaded<typeof api.conversations.list>;
}

/**
 * ConversationListPreloaded — uses server-preloaded conversations data.
 * Data is immediately available on first render (no loading spinner).
 */
export function ConversationListPreloaded({
	accountId,
	selectedConversationId,
	preloadedConversations,
}: ConversationListPreloadedProps) {
	const conversations = usePreloadedQuery(preloadedConversations);

	return (
		<ConversationListContent
			accountId={accountId}
			conversations={conversations}
			selectedConversationId={selectedConversationId}
		/>
	);
}

/** Shared rendering logic for conversation list */
function ConversationListContent({
	accountId,
	selectedConversationId,
	conversations,
}: {
	accountId: Id<"accounts">;
	selectedConversationId?: Id<"conversations">;
	conversations: FunctionReturnType<typeof api.conversations.list>;
}) {
	const [search, setSearch] = useState("");
	const [showArchivedOnly, setShowArchivedOnly] = useState(false);
	const archiveConversation = useMutation(api.conversations.archive);
	const unarchiveConversation = useMutation(api.conversations.unarchive);

	const visibleByArchiveState = showArchivedOnly
		? conversations.filter((conversation) => Boolean(conversation.archivedAt))
		: conversations.filter((conversation) => !conversation.archivedAt);

	const filtered = search.trim()
		? visibleByArchiveState.filter(
				(c) =>
					c.contact?.name?.toLowerCase().includes(search.toLowerCase()) ||
					c.contact?.phone?.includes(search),
			)
		: visibleByArchiveState;

	return (
		<div className="flex h-full flex-col">
			{/* Search */}
			<div className="space-y-1 px-3 pt-2 pb-1">
				<div className="flex items-center justify-between gap-2">
					<button
						className={cn(
							"rounded-md px-2 py-1 text-[11px] transition-colors",
							showArchivedOnly
								? "bg-sidebar-accent text-sidebar-foreground"
								: "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
						)}
						onClick={() => setShowArchivedOnly((current) => !current)}
						type="button"
					>
						{showArchivedOnly ? "Show Inbox" : "Show Archived"}
					</button>
				</div>
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
							{search
								? "No results"
								: showArchivedOnly
									? "No archived conversations"
									: "No conversations yet"}
						</p>
					</div>
				) : (
					filtered.map((conv) => {
						const name = conv.contact?.name ?? conv.contact?.phone ?? "Unknown";
						const isSelected = selectedConversationId === conv._id;
						const hasUnread = conv.unreadCount > 0;

						return (
							<div
								className={cn(
									"group flex items-start gap-1 px-1.5 py-1 transition-colors",
									isSelected
										? "bg-sidebar-accent"
										: "hover:bg-sidebar-accent/50",
								)}
								key={conv._id}
							>
								<Link
									className="min-w-0 flex-1 px-1.5 py-1.5"
									href={`/dashboard/${accountId}/${conv._id}`}
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
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											className="h-7 w-7 self-center text-muted-foreground hover:text-foreground"
											size="icon"
											variant="ghost"
										>
											<MoreHorizontal className="h-3.5 w-3.5" />
											<span className="sr-only">Conversation actions</span>
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{conv.archivedAt ? (
											<DropdownMenuItem
												onClick={() => {
													void unarchiveConversation({
														conversationId: conv._id,
													});
												}}
											>
												<ArchiveRestore className="h-3.5 w-3.5" />
												Unarchive
											</DropdownMenuItem>
										) : (
											<DropdownMenuItem
												onClick={() => {
													void archiveConversation({
														conversationId: conv._id,
													});
												}}
											>
												<Archive className="h-3.5 w-3.5" />
												Archive
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</div>
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
