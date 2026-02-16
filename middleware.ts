import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware();

export const config = {
	// Match all routes EXCEPT: static files, _next internals, /api/webhook, /api/twilio, /api/search, and /docs
	matcher: [
		"/((?!.*\\..*|_next|api/webhook|api/twilio|api/search|docs).*)",
		"/",
		"/(trpc)(.*)",
	],
};
