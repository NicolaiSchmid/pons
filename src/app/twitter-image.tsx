import { contentType, generateOGImage, size } from "@/lib/og";

export { size, contentType };
export const runtime = "nodejs";
export const alt = "Pons — WhatsApp Business API Bridge";

export default async function TwitterImage() {
	return generateOGImage({
		title: "WhatsApp Business\nAPI Bridge",
		subtitle:
			"Open-source bridge for the WhatsApp Cloud API.\nConnect AI agents via MCP.",
	});
}
