"use client";

import { useParams } from "next/navigation";
import { ApiKeyManager } from "@/components/ApiKeyManager";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function KeysPage() {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;

	return <ApiKeyManager accountId={accountId} />;
}
