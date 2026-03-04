import "@/styles/globals.css";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { ConvexClientProvider } from "./ConvexClientProvider";

export const metadata: Metadata = {
	metadataBase: new URL("https://pons.chat"),
	title: "Pons — WhatsApp Business API Bridge",
	description:
		"WhatsApp in your terminal. Messages in your AI. Bridge the WhatsApp Business Cloud API to any MCP-compatible client.",
	keywords: [
		"WhatsApp Business API",
		"MCP",
		"Model Context Protocol",
		"AI agent tools",
		"WhatsApp MCP server",
		"open source WhatsApp",
	],
	authors: [{ name: "Nicolai Schmid", url: "https://nicolaischmid.com" }],
	creator: "Nicolai Schmid",
	publisher: "Pons",
	category: "developer tools",
	icons: [
		{ rel: "icon", type: "image/svg+xml", url: "/favicon.svg" },
		{ rel: "icon", type: "image/svg+xml", url: "/pons-icon.svg" },
		{ rel: "icon", url: "/favicon.ico" },
	],
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-image-preview": "large",
			"max-snippet": -1,
			"max-video-preview": -1,
		},
	},
	openGraph: {
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"WhatsApp in your terminal. Messages in your AI. Send and receive messages from Claude, Cursor, or your own tools.",
		url: "https://pons.chat",
		siteName: "Pons",
		type: "website",
		images: [
			{
				url: "/api/og?title=WhatsApp%20Business%20API%20Bridge&subtitle=Open-source%20bridge%20for%20the%20WhatsApp%20Cloud%20API.%20Connect%20AI%20agents%20via%20MCP.",
				width: 1200,
				height: 630,
				alt: "Pons — WhatsApp Business API Bridge",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Pons — WhatsApp Business API Bridge",
		description:
			"WhatsApp in your terminal. Messages in your AI. Open-source bridge with MCP support.",
		images: [
			"/api/og?title=WhatsApp%20Business%20API%20Bridge&subtitle=Open-source%20bridge%20for%20the%20WhatsApp%20Cloud%20API.%20Connect%20AI%20agents%20via%20MCP.",
		],
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
				className={`${geist.variable} ${geistMono.variable} ${sora.variable}`}
				lang="en"
			>
				<body>
					<ConvexClientProvider>{children}</ConvexClientProvider>
					<Toaster position="top-center" />
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
