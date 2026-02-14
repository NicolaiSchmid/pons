"use client";

import { useQuery } from "convex/react";
import { MessageSquare, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface ConversationListProps {
	accountId: Id<"accounts">;
	selectedConversationId?: Id<"conversations">;
	onSelectConversation: (conversationId: Id<"conversations">) => void;
}

export function ConversationList({
	accountId,
	selectedConversationId,
	onSelectConversation,
}: ConversationListProps) {
	const conversations = useQuery(api.conversations.list, { accountId });
	const [search, setSearch] = useState("");

	if (!conversations) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
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
			<div className="shrink-0 p-3">
				<div className="relative">
					<Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						className="h-8 w-full rounded-md bg-muted pr-3 pl-9 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search conversations..."
						type="text"
						value={search}
					/>
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto">
				{filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 px-4 py-12">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
							<MessageSquare className="h-5 w-5 text-muted-foreground" />
						</div>
						<div className="text-center">
							<p className="font-medium text-foreground text-sm">
								{search ? "No results" : "No conversations"}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{search
									? "Try a different search"
									: "Messages will appear here when customers reach out"}
							</p>
						</div>
					</div>
				) : (
					filtered.map((conv) => (
						<button
							className={cn(
								"group flex w-full flex-col gap-1 border-border/50 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
								selectedConversationId === conv._id && "bg-muted/70",
							)}
							key={conv._id}
							onClick={() => onSelectConversation(conv._id)}
							type="button"
						>
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs uppercase">
										{getInitials(conv.contact?.name)}
									</div>
									<span className="truncate font-medium text-foreground text-sm">
										{conv.contact?.name ?? "Unknown"}
									</span>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{conv.lastMessageAt && (
										<span className="text-[11px] text-muted-foreground">
											{formatRelativeTime(conv.lastMessageAt)}
										</span>
									)}
									{conv.unreadCount > 0 && (
										<Badge
											className="h-5 min-w-5 justify-center rounded-full bg-pons-green px-1.5 font-medium text-[10px] text-pons-green-foreground hover:bg-pons-green"
											variant="default"
										>
											{conv.unreadCount}
										</Badge>
									)}
								</div>
							</div>
							{conv.lastMessagePreview && (
								<p className="truncate pl-10 text-muted-foreground text-xs leading-relaxed">
									{conv.lastMessagePreview}
								</p>
							)}
						</button>
					))
				)}
			</div>
		</div>
	);
}

function getInitials(name?: string): string {
	if (!name) return "?";
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.slice(0, 2);
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
