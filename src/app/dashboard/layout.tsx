"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { KeyRound, LogOut, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AccountSelector } from "@/components/AccountSelector";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signOut } = useAuthActions();
	const router = useRouter();
	const params = useParams();
	const accountId = params.accountId as string | undefined;

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-green border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		router.replace("/");
		return null;
	}

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-screen flex-col">
				<Navbar hideNav>
					<AccountSelector
						onSelectAccount={(id) => router.push(`/dashboard/${id}`)}
						selectedAccountId={accountId}
					/>
					{accountId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Link href={`/dashboard/${accountId}/settings`}>
									<Button
										className="h-7 w-7 text-muted-foreground hover:text-foreground"
										size="icon"
										variant="ghost"
									>
										<Settings className="h-3.5 w-3.5" />
									</Button>
								</Link>
							</TooltipTrigger>
							<TooltipContent>Account settings</TooltipContent>
						</Tooltip>
					)}
					<Separator className="!h-5 mx-1" orientation="vertical" />
					{accountId && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Link href={`/dashboard/${accountId}/keys`}>
									<Button
										className="h-8 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
										size="sm"
										variant="ghost"
									>
										<KeyRound className="h-3.5 w-3.5" />
										<span className="hidden sm:inline">API Keys</span>
									</Button>
								</Link>
							</TooltipTrigger>
							<TooltipContent>Manage MCP API keys</TooltipContent>
						</Tooltip>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<Link href="/dashboard/setup">
								<Button
									className="h-8 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
									size="sm"
									variant="ghost"
								>
									<Plus className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">Add Account</span>
								</Button>
							</Link>
						</TooltipTrigger>
						<TooltipContent>Connect a WhatsApp account</TooltipContent>
					</Tooltip>
					<Separator className="!h-5 mx-1" orientation="vertical" />
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								className="h-8 w-8 text-muted-foreground hover:text-foreground"
								onClick={() => void signOut()}
								size="icon"
								variant="ghost"
							>
								<LogOut className="h-3.5 w-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Sign out</TooltipContent>
					</Tooltip>
				</Navbar>
				{children}
			</div>
		</TooltipProvider>
	);
}
