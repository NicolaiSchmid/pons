/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { createMDX } from "fumadocs-mdx/next";

/** @type {import("next").NextConfig} */
const config = {
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "*.convex.cloud",
			},
		],
	},
	async headers() {
		return [
			{
				// Apply security headers to all routes
				source: "/(.*)",
				headers: [
					{
						key: "Content-Security-Policy",
						value: [
							"default-src 'self'",
							// Next.js requires inline scripts/styles for hydration
							"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
							"style-src 'self' 'unsafe-inline'",
							// Convex real-time + Google profile images
							"connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://accounts.google.com",
							"img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.convex.cloud",
							"font-src 'self'",
							"frame-src 'self'",
							"object-src 'none'",
							"base-uri 'self'",
							"form-action 'self'",
						].join("; "),
					},
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
					{
						key: "X-Frame-Options",
						value: "DENY",
					},
					{
						key: "Referrer-Policy",
						value: "strict-origin-when-cross-origin",
					},
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=()",
					},
				],
			},
			{
				// Webhook + MCP API routes: no CSP frame/form restrictions
				source: "/api/:path*",
				headers: [
					{
						key: "X-Content-Type-Options",
						value: "nosniff",
					},
				],
			},
		];
	},
};

const withMDX = createMDX();

export default withMDX(config);
