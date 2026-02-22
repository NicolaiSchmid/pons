"use client";

import type { Preloaded } from "convex/react";
import { ApiKeyManagerPreloaded } from "@/components/ApiKeyManager";
import type { api } from "../../../../../convex/_generated/api";

export function KeysPageClient({
	preloadedApiKeys,
}: {
	preloadedApiKeys: Preloaded<typeof api.mcp.listApiKeys>;
}) {
	return <ApiKeyManagerPreloaded preloadedApiKeys={preloadedApiKeys} />;
}
