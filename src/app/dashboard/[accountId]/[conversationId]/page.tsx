import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { preloadQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { ConversationPageClient } from "./page-client";

/**
 * Server Component: preloads conversation + messages data and passes to client.
 * Eliminates the "Loading messages..." spinner on first render.
 */
export default async function ConversationPage({
	params,
}: {
	params: Promise<{ accountId: string; conversationId: string }>;
}) {
	const { accountId, conversationId } = await params;
	const token = await convexAuthNextjsToken();

	const typedConversationId = conversationId as Id<"conversations">;

	const [preloadedConversation, preloadedMessages] = await Promise.all([
		preloadQuery(
			api.conversations.get,
			{ conversationId: typedConversationId },
			{ token },
		),
		preloadQuery(
			api.messages.list,
			{ conversationId: typedConversationId },
			{ token },
		),
	]);

	return (
		<ConversationPageClient
			accountId={accountId as Id<"accounts">}
			conversationId={typedConversationId}
			preloadedConversation={preloadedConversation}
			preloadedMessages={preloadedMessages}
		/>
	);
}
