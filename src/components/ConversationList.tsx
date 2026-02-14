"use client";

import { useQuery } from "convex/react";
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

	if (!conversations) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-slate-400">Loading conversations...</div>
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center p-4 text-center">
				<div className="text-slate-400">No conversations yet</div>
				<p className="mt-2 text-slate-500 text-sm">
					Conversations will appear here when customers message you
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col">
			{conversations.map((conv) => (
				<button
					className={`flex flex-col gap-1 border-slate-700 border-b p-4 text-left transition hover:bg-slate-800 ${
						selectedConversationId === conv._id ? "bg-slate-800" : ""
					}`}
					key={conv._id}
					onClick={() => onSelectConversation(conv._id)}
					type="button"
				>
					<div className="flex items-center justify-between">
						<span className="font-medium">
							{conv.contact?.name ?? "Unknown"}
						</span>
						{conv.unreadCount > 0 && (
							<span className="rounded-full bg-emerald-500 px-2 py-0.5 text-white text-xs">
								{conv.unreadCount}
							</span>
						)}
					</div>
					<div className="text-slate-400 text-sm">
						{conv.contact?.phone ?? ""}
					</div>
					{conv.lastMessagePreview && (
						<div className="truncate text-slate-500 text-sm">
							{conv.lastMessagePreview}
						</div>
					)}
					{conv.lastMessageAt && (
						<div className="text-slate-600 text-xs">
							{formatRelativeTime(conv.lastMessageAt)}
						</div>
					)}
				</button>
			))}
		</div>
	);
}

function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return new Date(timestamp).toLocaleDateString();
}
