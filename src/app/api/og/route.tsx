import type { NextRequest } from "next/server";
import { generateOGImage } from "@/lib/og";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const title = searchParams.get("title");
	const subtitle = searchParams.get("subtitle");

	return generateOGImage({
		title: title ?? "WhatsApp Business\nAPI Bridge",
		subtitle:
			subtitle ??
			"Open-source bridge for the WhatsApp Cloud API.\nConnect AI agents via MCP.",
	});
}
