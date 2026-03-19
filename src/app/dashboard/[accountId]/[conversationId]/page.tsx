import { preloadAuthQuery, requireAuthenticatedUser } from "@/lib/auth-server";
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
	await requireAuthenticatedUser("/");

	const typedConversationId = conversationId as Id<"conversations">;

	const [preloadedConversation, preloadedMessages] = await Promise.all([
		preloadAuthQuery(api.conversations.get, {
			conversationId: typedConversationId,
		}),
		preloadAuthQuery(api.messages.list, {
			conversationId: typedConversationId,
		}),
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
