import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function GET(
	_request: Request,
	context: { params: { messageId: string } },
) {
	const token = await convexAuthNextjsToken();
	if (!token) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const mediaUrl = await fetchQuery(
		api.messages.getMediaUrl,
		{ messageId: context.params.messageId as Id<"messages"> },
		{ token },
	);

	if (!mediaUrl) {
		return new NextResponse("Not found", { status: 404 });
	}

	const response = NextResponse.redirect(mediaUrl, 307);
	response.headers.set("Cache-Control", "no-store");
	return response;
}
