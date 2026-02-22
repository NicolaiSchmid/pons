"use client";

import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		router.replace("/");
		return null;
	}

	return <div className="flex h-screen flex-col">{children}</div>;
}
