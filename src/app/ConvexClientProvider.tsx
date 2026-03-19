"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import type { ReactNode } from "react";
import { env } from "@/env";
import { authClient } from "@/lib/auth-client";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export function ConvexClientProvider({
	children,
	initialToken,
}: {
	children: ReactNode;
	initialToken?: string | null;
}) {
	return (
		<ConvexBetterAuthProvider
			authClient={authClient}
			client={convex}
			initialToken={initialToken}
		>
			{children}
		</ConvexBetterAuthProvider>
	);
}
