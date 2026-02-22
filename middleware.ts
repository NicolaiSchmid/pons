import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/");
	}
});

export const config = {
	// Match all routes EXCEPT: static files, _next internals, /api/webhook, /api/twilio, /api/search, and /docs
	matcher: [
		"/((?!.*\\..*|_next|api/webhook|api/twilio|api/search|docs).*)",
		"/",
		"/(trpc)(.*)",
	],
};
