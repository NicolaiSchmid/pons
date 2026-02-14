"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface MessageThreadProps {
	conversationId: Id<"conversations">;
	accountId: Id<"accounts">;
}

export function MessageThread({
	conversationId,
	accountId,
}: MessageThreadProps) {
	const conversation = useQuery(api.conversations.get, { conversationId });
	const messagesResult = useQuery(api.messages.list, { conversationId });
	const markAsRead = useMutation(api.conversations.markAsRead);
	const sendTextMessage = useAction(api.whatsapp.sendTextMessage);

	const [messageText, setMessageText] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Mark conversation as read when opened
	useEffect(() => {
		if (conversation && conversation.unreadCount > 0) {
			markAsRead({ conversationId });
		}
	}, [conversation, conversationId, markAsRead]);

	// Scroll to bottom when new messages arrive
	const messageCount = messagesResult?.messages.length ?? 0;
	// biome-ignore lint/correctness/useExhaustiveDependencies: We want to scroll when messageCount changes
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageCount]);

	const handleSend = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!messageText.trim() || !conversation?.contact?.phone) return;

		setSending(true);
		setError(null);

		try {
			await sendTextMessage({
				accountId,
				conversationId,
				to: conversation.contact.phone,
				text: messageText.trim(),
			});
			setMessageText("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send message");
		} finally {
			setSending(false);
		}
	};

	if (!conversation || !messagesResult) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-slate-400">Loading messages...</div>
			</div>
		);
	}

	const messages = messagesResult.messages;
	const windowOpen = conversation.windowExpiresAt
		? conversation.windowExpiresAt > Date.now()
		: false;

	return (
		<div className="flex h-full flex-col">
			{/* Header */}
			<div className="border-slate-700 border-b p-4">
				<div className="font-medium">
					{conversation.contact?.name ?? "Unknown"}
				</div>
				<div className="text-slate-400 text-sm">
					{conversation.contact?.phone ?? ""}
				</div>
				{!windowOpen && (
					<div className="mt-2 rounded bg-amber-900/50 px-2 py-1 text-amber-300 text-xs">
						24-hour window closed. Use a template to start a new conversation.
					</div>
				)}
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4">
				<div className="flex flex-col gap-2">
					{messages.map((msg) => (
						<div
							className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
							key={msg._id}
						>
							<div
								className={`max-w-[70%] rounded-lg px-4 py-2 ${
									msg.direction === "outbound"
										? "bg-emerald-600 text-white"
										: "bg-slate-700 text-slate-100"
								}`}
							>
								{msg.type === "text" && <div>{msg.text}</div>}
								{msg.type !== "text" && (
									<div className="text-slate-300 italic">
										[{msg.type}
										{msg.caption ? `: ${msg.caption}` : ""}]
									</div>
								)}
								<div
									className={`mt-1 text-xs ${
										msg.direction === "outbound"
											? "text-emerald-200"
											: "text-slate-400"
									}`}
								>
									{formatTime(msg.timestamp)}
									{msg.direction === "outbound" && (
										<span className="ml-2">
											{msg.status === "read" && "✓✓"}
											{msg.status === "delivered" && "✓✓"}
											{msg.status === "sent" && "✓"}
											{msg.status === "pending" && "○"}
											{msg.status === "failed" && "✗"}
										</span>
									)}
								</div>
							</div>
						</div>
					))}
					<div ref={messagesEndRef} />
				</div>
			</div>

			{/* Input */}
			<form className="border-slate-700 border-t p-4" onSubmit={handleSend}>
				{error && (
					<div className="mb-2 rounded bg-red-900/50 px-2 py-1 text-red-300 text-sm">
						{error}
					</div>
				)}
				<div className="flex gap-2">
					<input
						className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2 disabled:opacity-50"
						disabled={sending || !windowOpen}
						onChange={(e) => setMessageText(e.target.value)}
						placeholder={
							windowOpen ? "Type a message..." : "Window closed - use template"
						}
						type="text"
						value={messageText}
					/>
					<button
						className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
						disabled={sending || !messageText.trim() || !windowOpen}
						type="submit"
					>
						{sending ? "..." : "Send"}
					</button>
				</div>
			</form>
		</div>
	);
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}
