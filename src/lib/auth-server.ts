import "server-only";

import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { redirect } from "next/navigation";
import { env } from "@/env";
import { api } from "../../convex/_generated/api";

export const {
	handler,
	preloadAuthQuery,
	isAuthenticated,
	getToken,
	fetchAuthQuery,
	fetchAuthMutation,
	fetchAuthAction,
} = convexBetterAuthNextJs({
	convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
	convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
});

export async function requireAuthenticatedUser(redirectTo = "/") {
	if (!(await isAuthenticated())) {
		redirect(redirectTo);
	}

	await fetchAuthMutation(api.auth.ensureCurrentUser, {});
}
