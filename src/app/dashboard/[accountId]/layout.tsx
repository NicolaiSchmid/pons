"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import {
	AlertCircle,
	FileText,
	KeyRound,
	LogOut,
	MessageSquare,
	Plus,
	Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AccountSelector } from "@/components/AccountSelector";
import { ConversationList } from "@/components/ConversationList";
import { Separator } from "@/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

function EmptyState({
	icon: Icon,
	title,
	description,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	description: string;
}) {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 p-8">
			<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
				<Icon className="h-5 w-5 text-muted-foreground" />
			</div>
			<div className="text-center">
				<p className="font-medium text-foreground text-sm">{title}</p>
				<p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
			</div>
		</div>
	);
}

export default function AccountLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const { signOut } = useAuthActions();
	const params = useParams();
	const pathname = usePathname();
	const router = useRouter();
	const accountId = params.accountId as Id<"accounts">;
	const conversationId = params.conversationId as
		| Id<"conversations">
		| undefined;
	const accounts = useQuery(api.accounts.list);
	const selectedAccount = accounts?.find((a) => a?._id === accountId);
	const isUsable = selectedAccount
		? USABLE_STATUSES.has(selectedAccount.status)
		: false;

	const basePath = `/dashboard/${accountId}`;
	const isTemplatesView = pathname.startsWith(`${basePath}/templates`);
	const activeTab = isTemplatesView ? "templates" : "conversations";

	const handleTabChange = (value: string) => {
		if (value === "templates") {
			router.push(`${basePath}/templates`);
		} else {
			router.push(basePath);
		}
	};

	return (
		<SidebarProvider
			className="flex-1 overflow-hidden"
			style={
				{
					"--sidebar-width": "20rem",
				} as React.CSSProperties
			}
		>
			<Sidebar collapsible="offcanvas">
				{/* Brand + account selector */}
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild size="lg">
								<Link href="/">
									<div className="flex h-8 w-8 items-center justify-center rounded-md bg-pons-green/10 ring-1 ring-pons-green/20">
										<MessageSquare className="h-4 w-4 text-pons-green" />
									</div>
									<div className="flex flex-col gap-0.5 leading-none">
										<span className="font-display font-semibold text-sm">
											Pons
										</span>
										<span className="text-muted-foreground text-xs">
											WhatsApp Bridge
										</span>
									</div>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
					<AccountSelector
						onSelectAccount={(id) => router.push(`/dashboard/${id}`)}
						selectedAccountId={accountId}
					/>
				</SidebarHeader>

				{/* Tabs + conversation list */}
				<SidebarContent className="gap-0 overflow-hidden">
					<SidebarGroup className="p-0">
						<Tabs
							className="flex flex-col gap-0"
							onValueChange={handleTabChange}
							value={activeTab}
						>
							<TabsList className="shrink-0 rounded-none border-b px-2 py-1.5">
								<TabsTrigger className="text-xs" value="conversations">
									<MessageSquare className="h-3.5 w-3.5" />
									Conversations
								</TabsTrigger>
								<TabsTrigger className="text-xs" value="templates">
									<FileText className="h-3.5 w-3.5" />
									Templates
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</SidebarGroup>

					<SidebarGroup className="flex-1 overflow-hidden p-0">
						<SidebarGroupContent className="h-full">
							{isTemplatesView ? null : isUsable ? (
								<ConversationList
									accountId={accountId}
									selectedConversationId={conversationId}
								/>
							) : (
								<EmptyState
									description="This account isn't ready for messaging yet"
									icon={AlertCircle}
									title="Account not ready"
								/>
							)}
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				{/* Settings / keys / signout */}
				<SidebarFooter>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip="Account settings">
								<Link href={`/dashboard/${accountId}/settings`}>
									<Settings className="h-4 w-4" />
									<span>Settings</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip="MCP API keys">
								<Link href={`/dashboard/${accountId}/keys`}>
									<KeyRound className="h-4 w-4" />
									<span>API Keys</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton asChild tooltip="Add WhatsApp account">
								<Link href="/dashboard/setup">
									<Plus className="h-4 w-4" />
									<span>Add Account</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => void signOut()}
								tooltip="Sign out"
							>
								<LogOut className="h-4 w-4" />
								<span>Sign out</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset className="overflow-hidden">
				<header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
					<SidebarTrigger className="-ml-1" />
					<Separator className="!h-4" orientation="vertical" />
					<span className="truncate text-muted-foreground text-sm">
						{selectedAccount?.displayName ?? "WhatsApp"}
					</span>
				</header>
				<div className="flex-1 overflow-hidden">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
