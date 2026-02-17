"use client";

import { useParams } from "next/navigation";
import { MessageThread } from "@/components/MessageThread";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function ConversationPage() {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;
	const conversationId = params.conversationId as Id<"conversations">;

	return (
		<MessageThread accountId={accountId} conversationId={conversationId} />
	);
}
