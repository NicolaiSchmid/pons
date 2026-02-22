"use client";

import type { Preloaded } from "convex/react";
import { MessageThreadPreloaded } from "@/components/MessageThread";
import type { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function ConversationPageClient({
	accountId,
	conversationId,
	preloadedConversation,
	preloadedMessages,
}: {
	accountId: Id<"accounts">;
	conversationId: Id<"conversations">;
	preloadedConversation: Preloaded<typeof api.conversations.get>;
	preloadedMessages: Preloaded<typeof api.messages.list>;
}) {
	return (
		<MessageThreadPreloaded
			accountId={accountId}
			conversationId={conversationId}
			preloadedConversation={preloadedConversation}
			preloadedMessages={preloadedMessages}
		/>
	);
}
