import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export default convexAuthNextjsMiddleware();

export const config = {
	// Match all routes EXCEPT: static files, _next internals, and /api/webhook
	matcher: ["/((?!.*\\..*|_next|api/webhook).*)", "/", "/(trpc)(.*)"],
};
