"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { env } from "@/env";

export const authClient = createAuthClient({
	baseURL:
		typeof window === "undefined"
			? env.NEXT_PUBLIC_APP_URL
			: window.location.origin,
	plugins: [convexClient(), genericOAuthClient(), oauthProviderClient()],
});
