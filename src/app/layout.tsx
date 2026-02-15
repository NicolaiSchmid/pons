import "@/styles/globals.css";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";

import { ConvexClientProvider } from "./ConvexClientProvider";

export const metadata: Metadata = {
	metadataBase: new URL("https://pons.chat"),
	title: "Pons — WhatsApp Business API Bridge",
	description:
		"Open-source WhatsApp Business Cloud API bridge with MCP support. Connect AI agents via MCP, manage conversations, send messages.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
	openGraph: {
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"Open-source bridge for the WhatsApp Cloud API. Connect AI agents via MCP, manage conversations, send messages.",
		url: "https://pons.chat",
		siteName: "Pons",
		type: "website",
	},
	twitter: {
		card: "summary",
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"Open-source bridge for the WhatsApp Cloud API. Connect AI agents via MCP.",
	},
	alternates: {
		canonical: "https://pons.chat",
	},
};

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
});

const sora = Sora({
	subsets: ["latin"],
	variable: "--font-sora",
	weight: ["400", "500", "600", "700"],
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<ConvexAuthNextjsServerProvider>
			<html
				className={`dark ${geist.variable} ${geistMono.variable} ${sora.variable}`}
				lang="en"
			>
				<body>
					<ConvexClientProvider>{children}</ConvexClientProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
