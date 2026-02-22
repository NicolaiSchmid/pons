"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import {
	ArrowRight,
	Check,
	Clock,
	Code2,
	Copy,
	GitBranch,
	Image,
	Key,
	MessageSquare,
	Terminal,
	Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";

const mcpConfig = `{
  "mcpServers": {
    "pons": {
      "url": "https://pons.chat/api/mcp",
      "headers": {
        "Authorization": "Bearer pons_your_key"
      }
    }
  }
}`;

const mcpTools = [
	{
		name: "list_conversations",
		scope: "read",
		desc: "List recent conversations with preview",
	},
	{
		name: "list_unanswered",
		scope: "read",
		desc: "Conversations awaiting your reply",
	},
	{
		name: "get_conversation",
		scope: "read",
		desc: "Full conversation with messages",
	},
	{
		name: "search_messages",
		scope: "read",
		desc: "Search messages by content",
	},
	{ name: "send_text", scope: "send", desc: "Send a text message" },
	{
		name: "send_template",
		scope: "send",
		desc: "Send template message (closed windows)",
	},
	{
		name: "list_templates",
		scope: "read",
		desc: "List available message templates",
	},
	{ name: "mark_as_read", scope: "write", desc: "Mark conversation as read" },
	{
		name: "send_reaction",
		scope: "write",
		desc: "React to a message with emoji",
	},
];

const features = [
	{
		icon: MessageSquare,
		title: "Full inbox",
		desc: "Real-time web UI with conversations, media, delivery receipts",
	},
	{
		icon: Terminal,
		title: "MCP server",
		desc: "Expose WhatsApp as tools for Claude, Cursor, or any MCP client",
	},
	{
		icon: Users,
		title: "Multi-tenant",
		desc: "Multiple WhatsApp Business Accounts, multiple users per account",
	},
	{
		icon: Image,
		title: "Media handling",
		desc: "Images, videos, documents auto-downloaded — Meta URLs expire in 5 min",
	},
	{
		icon: Clock,
		title: "24h window",
		desc: "Know when you can send free-form vs. template-only messages",
	},
	{
		icon: Key,
		title: "API keys",
		desc: "Scoped keys with expiration for different clients",
	},
];

const techStack = [
	{ label: "Next.js 16", detail: "App Router" },
	{ label: "Convex", detail: "Backend" },
	{ label: "MCP SDK", detail: "Streamable HTTP" },
	{ label: "shadcn/ui", detail: "Components" },
	{ label: "Tailwind v4", detail: "Styling" },
	{ label: "Vercel", detail: "FRA1" },
];

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const copy = useCallback(() => {
		void navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [text]);

	return (
		<button
			className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground"
			onClick={copy}
			type="button"
		>
			{copied ? (
				<Check className="h-3.5 w-3.5 text-pons-accent" />
			) : (
				<Copy className="h-3.5 w-3.5" />
			)}
		</button>
	);
}

function ScopeTag({ scope }: { scope: string }) {
	const colors: Record<string, string> = {
		read: "text-blue-400 bg-blue-400/10 border-blue-400/20",
		write: "text-pons-amber bg-pons-amber/10 border-pons-amber/20",
		send: "text-pons-accent bg-pons-accent/10 border-pons-accent/20",
	};
	return (
		<span
			className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] ${colors[scope] ?? "border-border bg-muted text-muted-foreground"}`}
		>
			{scope}
		</span>
	);
}

function FacebookIcon() {
	return (
		<svg
			aria-hidden="true"
			className="h-4 w-4"
			fill="#1877F2"
			viewBox="0 0 24 24"
		>
			<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
		</svg>
	);
}

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signIn } = useAuthActions();
	const router = useRouter();

	const handleSignIn = () => {
		void signIn("facebook", { redirectTo: "/dashboard" });
	};

	// Redirect authenticated users to /dashboard
	useEffect(() => {
		if (isAuthenticated) {
			router.replace("/dashboard");
		}
	}, [isAuthenticated, router]);

	if (isLoading || isAuthenticated) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-pons-accent border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading...</p>
				</div>
			</main>
		);
	}

	return (
		<main className="relative min-h-screen overflow-hidden bg-noise">
			<Navbar>
				<Button
					className="h-8 gap-2 rounded-md bg-pons-accent px-4 font-medium text-white text-xs hover:bg-pons-accent-bright"
					onClick={handleSignIn}
					size="sm"
				>
					<FacebookIcon />
					Sign in
				</Button>
			</Navbar>

			{/* ── Hero ── */}
			<section className="relative flex flex-col items-center px-6 pt-20 pb-20">
				{/* Gradient orb */}
				<div className="pointer-events-none absolute top-0 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/4 rounded-full bg-pons-accent/6 blur-[150px]" />

				<div className="relative z-10 flex flex-col items-center gap-8">
					{/* ASCII Logo */}
					<pre className="hidden select-none font-mono text-pons-accent text-xs leading-tight sm:block sm:text-sm">
						{`██████╗  ██████╗ ███╗   ██╗███████╗
██╔══██╗██╔═══██╗████╗  ██║██╔════╝
██████╔╝██║   ██║██╔██╗ ██║███████╗
██╔═══╝ ██║   ██║██║╚██╗██║╚════██║
██║     ╚██████╔╝██║ ╚████║███████║
╚═╝      ╚═════╝ ╚═╝  ╚═══╝╚══════╝`}
					</pre>
					{/* Mobile fallback */}
					<div className="flex items-center gap-3 sm:hidden">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pons-accent/10 ring-1 ring-pons-accent/20">
							<MessageSquare className="h-5 w-5 text-pons-accent" />
						</div>
						<span className="font-display font-semibold text-2xl tracking-tight">
							Pons
						</span>
					</div>

					{/* Headline */}
					<div className="flex max-w-2xl flex-col items-center gap-5 text-center">
						<h1 className="font-display font-semibold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
							WhatsApp in your terminal.
							<br />
							<span className="text-pons-accent">Messages in your AI.</span>
						</h1>
						<p className="max-w-lg text-base text-muted-foreground leading-relaxed sm:text-lg">
							Bridge the WhatsApp Business Cloud API to any MCP-compatible
							client. Send and receive messages from Claude, Cursor, or your own
							tools.
						</p>
					</div>

					{/* CTA */}
					<div className="flex flex-col items-center gap-3">
						<Button
							className="h-12 gap-2.5 rounded-lg bg-pons-accent px-7 font-medium text-sm text-white hover:bg-pons-accent-bright"
							onClick={handleSignIn}
							size="lg"
						>
							<FacebookIcon />
							Continue with Facebook
							<ArrowRight className="h-4 w-4" />
						</Button>
						<p className="text-muted-foreground text-xs">
							Sign in to connect your WhatsApp Business account
						</p>
					</div>
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── The Problem ── */}
			<section className="mx-auto max-w-3xl px-6 py-20">
				<p className="font-display text-lg text-muted-foreground leading-relaxed sm:text-xl">
					WhatsApp Business has a powerful API, but it&apos;s locked behind REST
					calls, webhook plumbing, and token management.{" "}
					<span className="text-foreground">Pons</span>{" "}
					<span className="text-muted-foreground/60 italic">
						(Latin for &ldquo;bridge&rdquo;)
					</span>{" "}
					connects WhatsApp to the{" "}
					<a
						className="text-pons-accent underline decoration-pons-accent/30 underline-offset-4 transition hover:decoration-pons-accent/60"
						href="https://modelcontextprotocol.io/"
						rel="noopener noreferrer"
						target="_blank"
					>
						Model Context Protocol
					</a>
					, so your AI assistant can read, search, and send WhatsApp messages as
					naturally as it reads files or searches the web.
				</p>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── Features ── */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<h2 className="mb-10 font-display font-semibold text-2xl tracking-tight sm:text-3xl">
					What it does
				</h2>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{features.map(({ icon: Icon, title, desc }) => (
						<div
							className="group rounded-lg border border-border/50 bg-card/40 p-5 transition hover:border-border hover:bg-card/70"
							key={title}
						>
							<div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-pons-accent/8 ring-1 ring-pons-accent/15">
								<Icon className="h-4 w-4 text-pons-accent" />
							</div>
							<h3 className="mb-1 font-display font-medium text-sm">{title}</h3>
							<p className="text-muted-foreground text-xs leading-relaxed">
								{desc}
							</p>
						</div>
					))}
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── MCP Config ── */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
					<div className="flex flex-col justify-center gap-5">
						<h2 className="font-display font-semibold text-2xl tracking-tight sm:text-3xl">
							Connect in 30 seconds
						</h2>
						<p className="text-muted-foreground text-sm leading-relaxed">
							Create an API key in the dashboard, paste this config into Claude
							Desktop, Cursor, or any MCP client. Done.
						</p>
						<div className="flex flex-wrap gap-2">
							{["Claude Desktop", "Cursor", "OpenCode", "Any MCP client"].map(
								(client) => (
									<span
										className="rounded-full border border-border/60 bg-card/50 px-3 py-1 text-muted-foreground text-xs"
										key={client}
									>
										{client}
									</span>
								),
							)}
						</div>
					</div>
					<div className="relative">
						<div className="relative overflow-hidden rounded-lg border border-border bg-muted/50">
							<div className="flex items-center gap-2 border-border border-b px-4 py-2.5">
								<Code2 className="h-3.5 w-3.5 text-muted-foreground" />
								<span className="font-mono text-muted-foreground text-xs">
									mcp.json
								</span>
							</div>
							<pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed">
								<code className="text-foreground/80">{mcpConfig}</code>
							</pre>
							<CopyButton text={mcpConfig} />
						</div>
					</div>
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── MCP Tools ── */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<div className="mb-8 flex items-end justify-between">
					<div>
						<h2 className="font-display font-semibold text-2xl tracking-tight sm:text-3xl">
							MCP Tools
						</h2>
						<p className="mt-2 text-muted-foreground text-sm">
							9 tools your AI can call. Scoped per API key.
						</p>
					</div>
					<div className="hidden items-center gap-3 sm:flex">
						<ScopeTag scope="read" />
						<ScopeTag scope="write" />
						<ScopeTag scope="send" />
					</div>
				</div>
				<div className="overflow-hidden rounded-lg border border-border/60">
					{mcpTools.map(({ name, scope, desc }, i) => (
						<div
							className={`flex items-center gap-4 px-4 py-3 ${i !== 0 ? "border-border/30 border-t" : ""} transition hover:bg-card/40`}
							key={name}
						>
							<code className="min-w-0 shrink-0 font-mono text-foreground/90 text-xs">
								{name}
							</code>
							<ScopeTag scope={scope} />
							<span className="ml-auto hidden text-right text-muted-foreground text-xs sm:block">
								{desc}
							</span>
						</div>
					))}
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── Architecture ── */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<h2 className="mb-8 font-display font-semibold text-2xl tracking-tight sm:text-3xl">
					Architecture
				</h2>
				<div className="overflow-hidden rounded-lg border border-border bg-muted/50 p-6 sm:p-8">
					<pre className="overflow-x-auto font-mono text-muted-foreground text-xs leading-relaxed sm:text-sm">
						{`+--------------+     +--------------+     +--------------+
|              |     |              |     |              |
|  Claude /    |---->|  Pons MCP    |---->|   Convex     |
|  Cursor      | MCP |  Endpoint    |     |   Backend    |
|              |     |  (Next.js)   |     |              |
+--------------+     +------+-------+     +------+-------+
                            |                    |
                     +------+-------+     +------+-------+
                     |              |     |              |
                     |  Pons Web    |     |  Meta Graph  |
                     |  Dashboard   |     |  API v22.0   |
                     |              |     |              |
                     +--------------+     +--------------+`}
					</pre>
				</div>

				{/* Data model */}
				<div className="mt-6 overflow-hidden rounded-lg border border-border bg-muted/50 p-6 sm:p-8">
					<h3 className="mb-4 font-display font-medium text-muted-foreground text-sm">
						Data Model
					</h3>
					<pre className="overflow-x-auto font-mono text-muted-foreground text-xs leading-relaxed">
						{`Account (WhatsApp Business Account)
|-- AccountMember (owner / admin / member)
|-- Contact (customer phone numbers)
|   +-- Conversation (thread with a contact)
|       +-- Message (text, media, location, reaction...)
|-- Template (pre-approved message templates)
|-- ApiKey (scoped MCP authentication)
+-- WebhookLog (raw payloads for debugging)`}
					</pre>
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── Tech Stack ── */}
			<section className="mx-auto max-w-5xl px-6 py-20">
				<h2 className="mb-8 font-display font-semibold text-2xl tracking-tight sm:text-3xl">
					Built with
				</h2>
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
					{techStack.map(({ label, detail }) => (
						<div
							className="rounded-lg border border-border/50 bg-card/30 px-4 py-3 text-center"
							key={label}
						>
							<div className="font-display font-medium text-sm">{label}</div>
							<div className="mt-0.5 text-muted-foreground text-xs">
								{detail}
							</div>
						</div>
					))}
				</div>
			</section>

			{/* ── Divider ── */}
			<div className="mx-auto h-px w-full max-w-4xl bg-gradient-to-r from-transparent via-border to-transparent" />

			{/* ── Bottom CTA ── */}
			<section className="relative flex flex-col items-center px-6 py-24">
				<div className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[400px] -translate-x-1/2 translate-y-1/2 rounded-full bg-pons-accent/4 blur-[120px]" />
				<div className="relative z-10 flex flex-col items-center gap-6 text-center">
					<h2 className="font-display font-semibold text-2xl tracking-tight sm:text-3xl">
						Ready to bridge?
					</h2>
					<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
						Open source under MIT. Self-host or use the hosted version at
						pons.chat.
					</p>
					<div className="flex items-center gap-3">
						<Button
							className="h-11 gap-2.5 rounded-lg bg-pons-accent px-6 font-medium text-sm text-white hover:bg-pons-accent-bright"
							onClick={handleSignIn}
							size="lg"
						>
							<FacebookIcon />
							Get started
							<ArrowRight className="h-4 w-4" />
						</Button>
						<a
							href="https://github.com/NicolaiSchmid/pons"
							rel="noopener noreferrer"
							target="_blank"
						>
							<Button
								className="h-11 gap-2 rounded-lg px-6 font-medium text-sm"
								size="lg"
								variant="outline"
							>
								<GitBranch className="h-4 w-4" />
								View source
							</Button>
						</a>
					</div>
				</div>
			</section>

			{/* ── Footer ── */}
			<footer className="border-border/40 border-t px-6 py-6">
				<div className="mx-auto flex max-w-5xl items-center justify-between">
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<MessageSquare className="h-3.5 w-3.5" />
						<span>Pons</span>
						<span className="text-border">·</span>
						<span>MIT License</span>
						<span className="text-border">·</span>
						<span>
							Built by{" "}
							<a
								className="text-foreground/70 underline decoration-border underline-offset-2 transition hover:text-foreground hover:decoration-foreground/40"
								href="https://nicolaischmid.com"
								rel="noopener noreferrer"
								target="_blank"
							>
								nicolaischmid.com
							</a>
						</span>
					</div>
					<div className="flex items-center gap-4 text-muted-foreground text-xs">
						<a className="transition hover:text-foreground" href="/docs">
							Docs
						</a>
						<a className="transition hover:text-foreground" href="/blog">
							Blog
						</a>
						<a className="transition hover:text-foreground" href="/privacy">
							Privacy
						</a>
						<a
							className="transition hover:text-foreground"
							href="https://github.com/NicolaiSchmid/pons"
							rel="noopener noreferrer"
							target="_blank"
						>
							GitHub
						</a>
					</div>
				</div>
			</footer>
		</main>
	);
}
