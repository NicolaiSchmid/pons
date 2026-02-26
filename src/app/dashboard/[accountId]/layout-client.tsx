"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { type Preloaded, usePreloadedQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import {
	AlertCircle,
	FileText,
	KeyRound,
	MessageSquare,
	PanelLeft,
	Settings,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { FC } from "react";
import { AccountSelectorPreloaded } from "@/components/AccountSelector";
import { ConversationListPreloaded } from "@/components/ConversationList";
import { Button } from "@/components/ui/button";
import {
	SidebarInset,
	SidebarProvider,
	useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/** Statuses that allow normal messaging */
const USABLE_STATUSES = new Set(["active", "pending_name_review"]);

const SIDEBAR_WIDTH = 320;
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

/* ── Sidebar content ── */

const PonsSidebarContent: FC<{
	accountId: Id<"accounts">;
	conversationId?: Id<"conversations">;
	isUsable: boolean;
	preloadedAccounts: Preloaded<typeof api.accounts.list>;
	preloadedConversations: Preloaded<typeof api.conversations.list>;
}> = ({
	accountId,
	conversationId,
	isUsable,
	preloadedAccounts,
	preloadedConversations,
}) => {
	const { signOut } = useAuthActions();
	const router = useRouter();

	return (
		<div className="flex h-full flex-col">
			{/* Account selector aligned with fixed sidebar toggle */}
			<div className="px-3 pt-3 pb-3 pl-11">
				<AccountSelectorPreloaded
					onAddAccount={() => router.push("/dashboard/setup")}
					onSelectAccount={(id) => router.push(`/dashboard/${id}`)}
					preloadedAccounts={preloadedAccounts}
					selectedAccountId={accountId}
				/>
			</div>

			{/* Scrollable content area */}
			<div className="flex-1 overflow-y-auto overflow-x-hidden">
				{isUsable ? (
					<ConversationListPreloaded
						accountId={accountId}
						preloadedConversations={preloadedConversations}
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

			{/* Footer — nav + legal */}
			<div className="">
				<div className="flex flex-col gap-0.5 px-2 py-1.5">
					{[
						{
							href: `/dashboard/${accountId}/templates`,
							icon: FileText,
							label: "Templates",
						},
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
					].map(({ href, icon: NavIcon, label }) => (
						<Link
							className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground text-sm transition-colors hover:bg-sidebar-accent"
							href={href}
							key={href}
						>
							<NavIcon className="h-4 w-4 text-muted-foreground" />
							<span>{label}</span>
						</Link>
					))}
				</div>

				{/* Legal links */}
				<div className="flex items-center justify-between border-sidebar-border border-t px-3 py-2">
					<div className="flex items-center gap-3">
						<Link
							className="text-[11px] text-muted-foreground transition-colors hover:text-sidebar-foreground"
							href="/imprint"
						>
							Imprint
						</Link>
						<Link
							className="text-[11px] text-muted-foreground transition-colors hover:text-sidebar-foreground"
							href="/privacy"
						>
							Privacy
						</Link>
					</div>
					<button
						className="text-[11px] text-muted-foreground transition-colors hover:text-sidebar-foreground"
						onClick={() => void signOut()}
						type="button"
					>
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
};

/* ── Fixed sidebar toggle button ── */

const FixedSidebarButton: FC = () => {
	const { toggleSidebar, open } = useSidebar();

	return (
		<div className="fixed top-3 left-2 z-20">
			<motion.div
				animate={{
					backgroundColor: open ? "transparent" : "var(--sidebar)",
				}}
				className="rounded-lg p-0.5"
				transition={{ duration: 0.15, ease: EASE }}
			>
				<Button
					className="h-8 w-8 p-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
					onClick={toggleSidebar}
					size="icon"
					variant="ghost"
				>
					<PanelLeft size={18} />
					<span className="sr-only">Toggle Sidebar</span>
				</Button>
			</motion.div>
		</div>
	);
};

/* ── Hybrid layout ── */

const HybridLayout: FC<{
	children: React.ReactNode;
	accountId: Id<"accounts">;
	conversationId?: Id<"conversations">;
	isUsable: boolean;
	preloadedAccounts: Preloaded<typeof api.accounts.list>;
	preloadedConversations: Preloaded<typeof api.conversations.list>;
}> = ({
	children,
	accountId,
	conversationId,
	isUsable,
	preloadedAccounts,
	preloadedConversations,
}) => {
	const { open, isMobile } = useSidebar();

	const sidebarContent = (
		<PonsSidebarContent
			accountId={accountId}
			conversationId={conversationId}
			isUsable={isUsable}
			preloadedAccounts={preloadedAccounts}
			preloadedConversations={preloadedConversations}
		/>
	);

	return (
		<div className="relative h-full w-full">
			<FixedSidebarButton />

			{isMobile ? (
				<div className="grid h-full w-full grid-cols-[auto,1fr]">
					<div className="h-full overflow-y-auto bg-sidebar text-sidebar-foreground">
						{sidebarContent}
					</div>
					<SidebarInset>
						<div className="relative flex h-full flex-1 flex-col">
							<div className="h-dvh w-full">{children}</div>
						</div>
					</SidebarInset>
				</div>
			) : (
				<div className="relative flex h-full justify-center overflow-hidden bg-sidebar">
					{/* Curved corner SVG — connects the left border + top border */}
					<AnimatePresence initial={false}>
						{open && (
							<motion.div
								animate={{
									opacity: 1,
									transition: { duration: 0.1, delay: 0.05 },
								}}
								className="pointer-events-none absolute z-[3]"
								exit={{
									opacity: 0,
									transition: { duration: 0 },
								}}
								initial={{ opacity: 0 }}
								style={{
									left: `${SIDEBAR_WIDTH - 1}px`,
									top: "0px",
								}}
							>
								<svg
									aria-hidden="true"
									height="35"
									viewBox="0 0 17 35"
									width="17"
								>
									{/* Top rectangle — filled with sidebar color */}
									<rect
										className="fill-sidebar"
										height="19"
										width="17"
										x="0"
										y="0"
									/>
									{/* Curved fill — sidebar bg behind the curve */}
									<path
										className="fill-sidebar"
										d="M 0 18.5 L 0 35 L 1 35 A 16 16 0 0 1 17 18.5 L 0 18.5 Z"
									/>
									{/* Curved border stroke — the visible arc */}
									<path
										className="fill-none stroke-sidebar-border"
										d="M 1 35 A 16 16 0 0 1 17 18.5"
										strokeWidth="1"
									/>
								</svg>
							</motion.div>
						)}
					</AnimatePresence>

					{/* Sidebar panel */}
					<motion.div
						animate={{
							x: open ? 0 : -SIDEBAR_WIDTH,
							opacity: open ? 1 : 0,
						}}
						className="absolute top-0 left-0 z-[2] h-full shrink-0 overflow-hidden bg-sidebar text-sidebar-foreground"
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
						className="relative h-full shrink-0 bg-sidebar"
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
									className="fixed top-0 left-0 z-[1] h-[18px] w-screen bg-sidebar"
									initial={false}
									transition={{
										duration: 0.1,
										ease: "easeInOut",
										delay: open ? 0.02 : 0,
									}}
								/>

								<div
									className={cn(
										"relative w-full bg-background",
										open
											? "mt-[18px] h-[calc(100dvh-18px)] rounded-tl-[16px] border-sidebar-border border-t border-l"
											: "h-dvh",
									)}
								>
									{children}
								</div>
							</div>
						</SidebarInset>
					</motion.div>
				</div>
			)}
		</div>
	);
};

/* ── Root client layout ── */

export function AccountLayoutClient({
	children,
	accountId,
	preloadedAccounts,
	preloadedConversations,
}: {
	children: React.ReactNode;
	accountId: Id<"accounts">;
	preloadedAccounts: Preloaded<typeof api.accounts.list>;
	preloadedConversations: Preloaded<typeof api.conversations.list>;
}) {
	const params = useParams();
	const pathname = usePathname();
	const router = useRouter();
	const conversationId = params.conversationId as
		| Id<"conversations">
		| undefined;
	const accounts = usePreloadedQuery(preloadedAccounts);
	const selectedAccount = accounts?.find((a) => a?._id === accountId);
	const isUsable = selectedAccount
		? USABLE_STATUSES.has(selectedAccount.status)
		: false;

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
				conversationId={conversationId}
				isUsable={isUsable}
				preloadedAccounts={preloadedAccounts}
				preloadedConversations={preloadedConversations}
			>
				{children}
			</HybridLayout>
		</SidebarProvider>
	);
}
