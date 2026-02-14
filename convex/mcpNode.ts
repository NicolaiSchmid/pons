"use node";

import crypto from "node:crypto";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Hash an API key for storage/lookup
export function hashApiKey(key: string): string {
	return crypto.createHash("sha256").update(key).digest("hex");
}

// Generate a new API key
export function generateApiKey(): string {
	const randomBytes = crypto.randomBytes(32).toString("base64url");
	return `pons_${randomBytes}`;
}

// Action to generate API key and hash (called from mutation)
export const generateApiKeyAction = internalAction({
	args: {},
	handler: async () => {
		const apiKey = generateApiKey();
		const keyHash = hashApiKey(apiKey);
		const keyPrefix = apiKey.slice(0, 12); // "pons_" + 7 chars
		return { apiKey, keyHash, keyPrefix };
	},
});

// Action to hash API key (for validation)
export const hashApiKeyAction = internalAction({
	args: { apiKey: v.string() },
	handler: async (_ctx, args) => {
		return hashApiKey(args.apiKey);
	},
});
