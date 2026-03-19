import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Server-side environment variables schema.
	 */
	server: {
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		BETTER_AUTH_SECRET: z.string().optional(),
	},

	/**
	 * Client-side environment variables schema.
	 * Exposed to the browser via NEXT_PUBLIC_ prefix.
	 */
	client: {
		NEXT_PUBLIC_APP_URL: z.string().url().default("https://pons.chat"),
		NEXT_PUBLIC_CONVEX_URL: z.string().url(),
		NEXT_PUBLIC_CONVEX_SITE_URL: z.string().url(),
	},

	/**
	 * Runtime environment variables.
	 */
	runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://pons.chat",
		NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
		NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
	},

	/**
	 * Skip validation during Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,

	/**
	 * Treat empty strings as undefined.
	 */
	emptyStringAsUndefined: true,
});
