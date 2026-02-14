import "@/styles/globals.css";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Sora } from "next/font/google";

import { ConvexClientProvider } from "./ConvexClientProvider";

export const metadata: Metadata = {
	title: "Pons — WhatsApp Business API Bridge",
	description:
		"Open-source WhatsApp Business Cloud API bridge with MCP support",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
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
