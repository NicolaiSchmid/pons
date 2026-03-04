import {
	convexAuthNextjsMiddleware,
	createRouteMatcher,
	nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);
const LAST_ACCOUNT_COOKIE = "pons_last_account_id";

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
	if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
		return nextjsMiddlewareRedirect(request, "/");
	}

	if (request.nextUrl.pathname === "/dashboard") {
		const lastAccountId = request.cookies.get(LAST_ACCOUNT_COOKIE)?.value;
		if (lastAccountId && !lastAccountId.includes("/")) {
			return nextjsMiddlewareRedirect(request, `/dashboard/${lastAccountId}`);
		}
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
