"use client";

import { useConvexAuth } from "convex/react";
import { MessageSquare } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

function getSafeNextPath(nextParam: string | null) {
	if (!nextParam) {
		return "/dashboard";
	}

	if (!nextParam.startsWith("/")) {
		return "/dashboard";
	}

	if (nextParam.startsWith("//")) {
		return "/dashboard";
	}

	return nextParam;
}

export default function AuthCompletePage() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const nextPath = useMemo(
		() => getSafeNextPath(searchParams.get("next")),
		[searchParams],
	);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		if (isAuthenticated) {
			router.replace(nextPath);
			return;
		}

		router.replace("/");
	}, [isAuthenticated, isLoading, nextPath, router]);

	return (
		<main className="flex min-h-screen items-center justify-center">
			<div className="flex flex-col items-center gap-4">
				<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pons-accent/10 ring-1 ring-pons-accent/20">
					<MessageSquare className="h-5 w-5 text-pons-accent" />
				</div>
				<div className="flex flex-col items-center gap-1.5">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-sm">Completing sign-in...</p>
				</div>
			</div>
		</main>
	);
}
