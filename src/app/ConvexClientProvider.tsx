"use client";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
	throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
}
const convex = new ConvexReactClient(convexUrl);

// Debug: Log localStorage operations
const debugStorage = {
	getItem: (key: string) => {
		const value = localStorage.getItem(key);
		console.log(`[Storage] getItem(${key}):`, value?.slice(0, 50) + "...");
		return value;
	},
	setItem: (key: string, value: string) => {
		console.log(`[Storage] setItem(${key}):`, value.slice(0, 50) + "...");
		localStorage.setItem(key, value);
	},
	removeItem: (key: string) => {
		console.log(`[Storage] removeItem(${key})`);
		localStorage.removeItem(key);
	},
};

export function ConvexClientProvider({ children }: { children: ReactNode }) {
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	if (!isClient) {
		return null;
	}

	return (
		<ConvexAuthProvider client={convex} storage={debugStorage}>
			{children}
		</ConvexAuthProvider>
	);
}
