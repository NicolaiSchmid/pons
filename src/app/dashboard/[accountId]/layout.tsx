"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	FileText,
	KeyRound,
	LogOut,
	MessageSquare,
	PanelLeft,
	Plus,
	Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { FC } from "react";
import { AccountSelector } from "@/components/AccountSelector";
import { ComposeDialog } from "@/components/ComposeDialog";
import { ConversationList } from "@/components/ConversationList";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

const SIDEBAR_WIDTH = 320; // 20rem
const EASE = [0.23, 1, 0.32, 1] as const;

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

/* ── Sidebar content (brand, account, tabs, conversations, footer) ── */

const PonsSidebarContent: FC<{
	accountId: Id<"accounts">;
	conversationId?: Id<"conversations">;
	isUsable: boolean;
	isTemplatesView: boolean;
	activeTab: string;
	onTabChange: (value: string) => void;
}> = ({
	accountId,
	conversationId,
	isUsable,
	isTemplatesView,
	activeTab,
	onTabChange,
}) => {
	const { signOut } = useAuthActions();
	const router = useRouter();

	return (
		<div className="flex h-full flex-col">
			{/* Brand + account selector — padded below fixed button */}
			<div className="flex flex-col gap-2 px-3 pt-14 pb-2">
				<Link
					className="flex items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-sidebar-accent"
					href="/"
				>
					<div className="flex h-8 w-8 items-center justify-center rounded-md bg-pons-green/10 ring-1 ring-pons-green/20">
						<MessageSquare className="h-4 w-4 text-pons-green" />
					</div>
					<div className="flex flex-col gap-0 leading-none">
						<span className="font-display font-semibold text-sm">Pons</span>
						<span className="text-muted-foreground text-xs">
							WhatsApp Bridge
						</span>
					</div>
				</Link>
				<AccountSelector
					onSelectAccount={(id) => router.push(`/dashboard/${id}`)}
					selectedAccountId={accountId}
				/>
			</div>

			{/* Tabs */}
			<div className="px-2">
				<Tabs
					className="flex flex-col gap-0"
					onValueChange={onTabChange}
					value={activeTab}
				>
					<TabsList className="shrink-0 rounded-none border-b px-1 py-1.5">
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
			</div>

			{/* Conversation list */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden">
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
			</div>

			{/* Footer nav */}
			<div className="flex flex-col gap-0.5 border-t px-2 py-2">
				{[
					{
						href: `/dashboard/${accountId}/settings`,
						icon: Settings,
						label: "Settings",
					},
					{
						href: `/dashboard/${accountId}/keys`,
						icon: KeyRound,
						label: "API Keys",
					},
					{
						href: "/dashboard/setup",
						icon: Plus,
						label: "Add Account",
					},
				].map(({ href, icon: NavIcon, label }) => (
					<Link
						className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent"
						href={href}
						key={href}
					>
						<NavIcon className="h-4 w-4" />
						<span>{label}</span>
					</Link>
				))}
				<button
					className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent"
					onClick={() => void signOut()}
					type="button"
				>
					<LogOut className="h-4 w-4" />
					<span>Sign out</span>
				</button>
			</div>
		</div>
	);
};

/* ── Fixed sidebar toggle button ── */

const FixedSidebarButton: FC<{ accountId: Id<"accounts"> }> = ({
	accountId,
}) => {
	const { toggleSidebar, open } = useSidebar();

	return (
		<div className="fixed top-3.5 left-2 z-50">
			<AnimatePresence>
				{!open ? (
					/* Closed — container with toggle + compose */
					<motion.div
						animate={{ opacity: 1, scale: 1 }}
						className="flex gap-1 rounded-md bg-sidebar p-1"
						exit={{ opacity: 0, scale: 0.9 }}
						initial={{ opacity: 0, scale: 0.9 }}
						key="closed-buttons"
						style={{ marginLeft: "-5px", marginTop: "-5px" }}
						transition={{ duration: 0.1 }}
					>
						<Button
							className="h-8 w-8 p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							onClick={toggleSidebar}
							size="icon"
							variant="ghost"
						>
							<PanelLeft size={20} />
							<span className="sr-only">Toggle Sidebar</span>
						</Button>

						<motion.div
							animate={{ width: "auto", opacity: 1 }}
							exit={{ width: 0, opacity: 0 }}
							initial={{ width: 0, opacity: 0 }}
							style={{ overflow: "hidden" }}
							transition={{ duration: 0.12, delay: 0.02 }}
						>
							<ComposeDialog
								accountId={accountId}
								trigger={
									<Button
										className="h-8 w-8 p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
										size="icon"
										variant="ghost"
									>
										<Plus size={20} />
										<span className="sr-only">New conversation</span>
									</Button>
								}
							/>
						</motion.div>
					</motion.div>
				) : (
					/* Open — just the toggle */
					<motion.div
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						initial={{ opacity: 0 }}
						key="open-button"
						transition={{ duration: 0.08 }}
					>
						<Button
							className="h-8 w-8 p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
							onClick={toggleSidebar}
							size="icon"
							variant="ghost"
						>
							<PanelLeft size={20} />
							<span className="sr-only">Toggle Sidebar</span>
						</Button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
};

/* ── Hybrid layout (mobile grid / desktop framer-motion) ── */

const HybridLayout: FC<{
	children: React.ReactNode;
	accountId: Id<"accounts">;
	conversationId?: Id<"conversations">;
	isUsable: boolean;
	isTemplatesView: boolean;
	activeTab: string;
	onTabChange: (value: string) => void;
}> = ({
	children,
	accountId,
	conversationId,
	isUsable,
	isTemplatesView,
	activeTab,
	onTabChange,
}) => {
	const { open, isMobile } = useSidebar();

	const sidebarContent = (
		<PonsSidebarContent
			accountId={accountId}
			activeTab={activeTab}
			conversationId={conversationId}
			isTemplatesView={isTemplatesView}
			isUsable={isUsable}
			onTabChange={onTabChange}
		/>
	);

	return (
		<div className="relative h-full w-full">
			<FixedSidebarButton accountId={accountId} />

			{isMobile ? (
				/* Mobile — simple grid with standard sidebar behavior */
				<div className="grid h-full w-full grid-cols-[auto,1fr]">
					<div className="h-full overflow-y-auto bg-sidebar text-sidebar-foreground">
						{sidebarContent}
					</div>
					<SidebarInset>
						<div className="relative flex h-full flex-1 flex-col">
							<main className="h-dvh w-full">{children}</main>
						</div>
					</SidebarInset>
				</div>
			) : (
				/* Desktop — Framer Motion animated panels */
				<div className="relative flex h-full justify-center overflow-hidden">
					{/* Curved arch SVG overlay at sidebar edge */}
					<AnimatePresence initial={false}>
						{open && (
							<motion.div
								animate={{
									opacity: 1,
									transition: { duration: 0.1, delay: 0.05 },
								}}
								className="pointer-events-none absolute z-[5]"
								exit={{
									opacity: 0,
									transition: { duration: 0 },
								}}
								initial={{ opacity: 0 }}
								style={{
									left: `${SIDEBAR_WIDTH - 5}px`,
									top: "-5px",
								}}
							>
								<svg
									aria-hidden="true"
									height="45"
									viewBox="0 0 20 45"
									width="20"
								>
									{/* Top half — solid background matching top bar */}
									<rect
										className="fill-sidebar"
										height="23"
										width="20"
										x="0"
										y="0"
									/>
									{/* Bottom half — curved corner */}
									<path
										className="fill-sidebar"
										d="M -0.5 22.5 L -0.5 37.5 L 4.5 37.5 Q 4.5 22.5 20.5 22.5 L -0.5 22.5 Z"
									/>
									{/* Curved border stroke */}
									<path
										className="fill-none stroke-sidebar"
										d="M 4.5 37.5 Q 4.5 22.5 20.5 22.5"
										strokeWidth="1"
									/>
								</svg>
							</motion.div>
						)}
					</AnimatePresence>

					{/* Sidebar panel — slides in from left */}
					<motion.div
						animate={{
							x: open ? 0 : -SIDEBAR_WIDTH,
							opacity: open ? 1 : 0,
						}}
						className="absolute top-0 left-0 z-10 h-full shrink-0 overflow-y-auto bg-sidebar text-sidebar-foreground"
						initial={false}
						style={{
							width: `${SIDEBAR_WIDTH}px`,
							minWidth: `${SIDEBAR_WIDTH}px`,
						}}
						transition={{
							duration: 0.15,
							ease: EASE,
							opacity: { duration: 0.1, delay: open ? 0.02 : 0 },
						}}
					>
						{sidebarContent}
					</motion.div>

					{/* Main content panel */}
					<motion.div
						animate={{
							width: open ? `calc(100vw - ${SIDEBAR_WIDTH}px)` : "100vw",
							marginLeft: open ? `${SIDEBAR_WIDTH}px` : "0px",
						}}
						className="relative h-full shrink-0"
						style={{
							width: open ? `calc(100vw - ${SIDEBAR_WIDTH}px)` : "100vw",
							marginLeft: open ? `${SIDEBAR_WIDTH}px` : "0px",
						}}
						transition={{
							duration: 0.15,
							ease: EASE,
						}}
					>
						<SidebarInset className="h-full">
							<div className="relative flex h-full flex-1 flex-col">
								{/* Top bar — sidebar color bleed */}
								<motion.div
									animate={{ y: open ? 0 : -18 }}
									className="fixed top-0 left-0 z-[5] h-[18px] w-screen bg-sidebar"
									initial={false}
									transition={{
										duration: 0.1,
										ease: "easeInOut",
										delay: open ? 0.02 : 0,
									}}
								/>

								<main
									className={cn(
										"relative w-full",
										open ? "mt-[18px] h-[calc(100dvh-18px)]" : "h-dvh",
									)}
								>
									{children}
								</main>
							</div>
						</SidebarInset>
					</motion.div>
				</div>
			)}
		</div>
	);
};

/* ── Root layout ── */

export default function AccountLayout({
	children,
}: {
	children: React.ReactNode;
}) {
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
			defaultOpen={true}
			style={
				{
					"--sidebar-width": `${SIDEBAR_WIDTH}px`,
				} as React.CSSProperties
			}
		>
			<HybridLayout
				accountId={accountId}
				activeTab={activeTab}
				conversationId={conversationId}
				isTemplatesView={isTemplatesView}
				isUsable={isUsable}
				onTabChange={handleTabChange}
			>
				{children}
			</HybridLayout>
		</SidebarProvider>
	);
}
