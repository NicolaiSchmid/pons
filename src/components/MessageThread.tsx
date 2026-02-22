"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	Check,
	CheckCheck,
	Circle,
	Clock,
	FileText,
	Image,
	Paperclip,
	Send,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { TemplatePicker, type TemplatePickerResult } from "./TemplatePicker";

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
	const sendTextMessage = useAction(api.whatsapp.sendTextMessageUI);
	const sendTemplateMessage = useAction(api.whatsapp.sendTemplateMessageUI);

	const [messageText, setMessageText] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sendingTemplate, setSendingTemplate] = useState(false);
	const [templateError, setTemplateError] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

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

	// Focus input when switching conversations
	// biome-ignore lint/correctness/useExhaustiveDependencies: We want to re-focus when conversationId changes
	useEffect(() => {
		inputRef.current?.focus();
	}, [conversationId]);

	const handleSendTemplate = async (result: TemplatePickerResult) => {
		if (!conversation?.contact?.phone) return;

		setSendingTemplate(true);
		setTemplateError(null);

		try {
			await sendTemplateMessage({
				accountId,
				conversationId,
				to: conversation.contact.phone,
				templateName: result.template.name,
				templateLanguage: result.template.language,
				components: result.components,
			});
		} catch (err) {
			setTemplateError(
				err instanceof Error ? err.message : "Failed to send template",
			);
		} finally {
			setSendingTemplate(false);
		}
	};

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
			inputRef.current?.focus();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send message");
		} finally {
			setSending(false);
		}
	};

	if (!conversation || !messagesResult) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-4 w-4 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-xs">Loading messages...</p>
				</div>
			</div>
		);
	}

	const messages = messagesResult.messages;
	const windowOpen = conversation.windowExpiresAt
		? conversation.windowExpiresAt > Date.now()
		: false;

	return (
		<div className="flex h-full flex-col">
			{/* Thread header */}
			<div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-3">
					<div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs uppercase">
						{getInitials(
							conversation.contact?.name,
							conversation.contact?.phone,
						)}
					</div>
					<div>
						<p className="font-medium text-foreground text-sm leading-none">
							{conversation.contact?.name ??
								conversation.contact?.phone ??
								"Unknown"}
						</p>
						{conversation.contact?.name && conversation.contact?.phone && (
							<p className="mt-1 text-muted-foreground text-xs">
								{conversation.contact.phone}
							</p>
						)}
					</div>
				</div>
				{!windowOpen && (
					<div className="flex items-center gap-1.5 rounded-md bg-pons-amber-surface px-2.5 py-1 text-pons-amber text-xs">
						<Clock className="h-3 w-3" />
						Window closed
					</div>
				)}
			</div>

			{/* Messages */}
			<div className="flex-1 overflow-y-auto px-4 py-4">
				<div className="mx-auto flex max-w-2xl flex-col gap-1.5">
					{messages.map((msg, i) => {
						const isOutbound = msg.direction === "outbound";
						const prevMsg = i > 0 ? messages[i - 1] : null;
						const sameDirection = prevMsg?.direction === msg.direction;
						const timeDiff = prevMsg
							? msg.timestamp - prevMsg.timestamp
							: Number.POSITIVE_INFINITY;
						const showGap = !sameDirection || timeDiff > 300000; // 5min gap

						return (
							<div
								className={cn(
									"flex",
									isOutbound ? "justify-end" : "justify-start",
									showGap && i > 0 && "mt-3",
								)}
								key={msg._id}
							>
								<div
									className={cn(
										"max-w-[75%] rounded-lg px-3 py-2",
										isOutbound
											? "bg-pons-accent-surface text-foreground"
											: "bg-muted text-foreground",
									)}
								>
									{msg.type === "text" ? (
										<p className="whitespace-pre-wrap text-sm leading-relaxed">
											{msg.text}
										</p>
									) : msg.type === "template" ? (
										<div className="flex items-center gap-1.5 text-sm">
											<FileText className="h-3.5 w-3.5 shrink-0 text-pons-accent" />
											<span className="text-muted-foreground italic">
												Template: {msg.templateName ?? "unknown"}
											</span>
										</div>
									) : (
										<div className="flex items-center gap-1.5 text-muted-foreground text-sm italic">
											{msg.type === "image" ? (
												<Image className="h-3.5 w-3.5" />
											) : (
												<Paperclip className="h-3.5 w-3.5" />
											)}
											<span>
												{msg.type}
												{msg.caption ? `: ${msg.caption}` : ""}
											</span>
										</div>
									)}
									<div
										className={cn(
											"mt-1 flex items-center gap-1 text-[11px]",
											isOutbound
												? "justify-end text-pons-accent-dim"
												: "text-muted-foreground",
										)}
									>
										<span>{formatTime(msg.timestamp)}</span>
										{isOutbound && <StatusIcon status={msg.status} />}
									</div>
								</div>
							</div>
						);
					})}
					<div ref={messagesEndRef} />
				</div>
			</div>

			{/* Input */}
			<div className="shrink-0 border-t px-4 py-3">
				{error && (
					<div className="mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						<X
							className="h-3.5 w-3.5 shrink-0 cursor-pointer"
							onClick={() => setError(null)}
						/>
						{error}
					</div>
				)}
				{windowOpen ? (
					<form className="mx-auto flex max-w-2xl gap-2" onSubmit={handleSend}>
						<input
							className="h-10 flex-1 rounded-md border bg-muted px-3 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
							disabled={sending}
							onChange={(e) => setMessageText(e.target.value)}
							placeholder="Type a message..."
							ref={inputRef}
							type="text"
							value={messageText}
						/>
						<Button
							className="h-10 w-10 shrink-0 bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
							disabled={sending || !messageText.trim()}
							size="icon"
							type="submit"
						>
							<Send className="h-4 w-4" />
						</Button>
					</form>
				) : (
					<div className="mx-auto max-w-2xl">
						<TemplatePicker
							accountId={accountId}
							compact
							error={templateError}
							onSend={handleSendTemplate}
							sending={sendingTemplate}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

function StatusIcon({ status }: { status?: string }) {
	switch (status) {
		case "read":
			return <CheckCheck className="h-3 w-3 text-pons-accent" />;
		case "delivered":
			return <CheckCheck className="h-3 w-3" />;
		case "sent":
			return <Check className="h-3 w-3" />;
		case "pending":
			return <Circle className="h-2.5 w-2.5" />;
		case "failed":
			return <AlertTriangle className="h-3 w-3 text-destructive" />;
		default:
			return null;
	}
}

function getInitials(name?: string, phone?: string): string {
	if (name) {
		return name
			.split(" ")
			.map((w) => w[0])
			.join("")
			.slice(0, 2);
	}
	if (phone) return phone.slice(-2);
	return "?";
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}
