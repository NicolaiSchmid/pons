import { type NextRequest, NextResponse } from "next/server";

const LAST_ACCOUNT_COOKIE = "pons_last_account_id";

export default function middleware(request: NextRequest) {
	if (request.nextUrl.pathname === "/dashboard") {
		const lastAccountId = request.cookies.get(LAST_ACCOUNT_COOKIE)?.value;
		if (lastAccountId && !lastAccountId.includes("/")) {
			return NextResponse.redirect(
				new URL(`/dashboard/${lastAccountId}`, request.url),
			);
		}
	}

	return NextResponse.next();
}

export const config = {
	// Match all routes EXCEPT: static files, _next internals, /api/webhook, /api/twilio, /api/search, and /docs
	matcher: [
		"/((?!.*\\..*|_next|api/webhook|api/twilio|api/search|docs).*)",
		"/",
		"/(trpc)(.*)",
	],
};
