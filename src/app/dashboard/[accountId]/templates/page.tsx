"use client";

import { useAction } from "convex/react";
import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	FileText,
	Loader2,
	Pause,
	XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { Template } from "../../../../../convex/whatsapp";

type StatusInfo = {
	icon: React.ComponentType<{ className?: string }>;
	color: string;
	label: string;
};

const FALLBACK_STATUS: StatusInfo = {
	icon: Clock,
	color: "text-pons-amber",
	label: "Pending",
};

const STATUS_CONFIG: Record<string, StatusInfo> = {
	approved: {
		icon: CheckCircle2,
		color: "text-pons-accent",
		label: "Approved",
	},
	pending: FALLBACK_STATUS,
	rejected: { icon: XCircle, color: "text-destructive", label: "Rejected" },
	paused: { icon: Pause, color: "text-muted-foreground", label: "Paused" },
	disabled: {
		icon: AlertTriangle,
		color: "text-muted-foreground",
		label: "Disabled",
	},
};

function TemplateCard({ template }: { template: Template }) {
	const statusConfig = STATUS_CONFIG[template.status] ?? FALLBACK_STATUS;
	const StatusIcon = statusConfig.icon;

	const headerComponent = template.components.find(
		(c) => c.type === "HEADER" || c.type === "header",
	);
	const bodyComponent = template.components.find(
		(c) => c.type === "BODY" || c.type === "body",
	);
	const footerComponent = template.components.find(
		(c) => c.type === "FOOTER" || c.type === "footer",
	);
	const buttonsComponent = template.components.find(
		(c) => c.type === "BUTTONS" || c.type === "buttons",
	);

	return (
		<div className="group rounded-lg border bg-card p-4 transition hover:border-border/80 hover:bg-card/80">
			{/* Header row */}
			<div className="flex items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2.5">
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pons-accent/10">
						<FileText className="h-4 w-4 text-pons-accent" />
					</div>
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground text-sm">
							{template.name}
						</p>
						<p className="text-muted-foreground text-xs">
							{template.language} · {template.category}
						</p>
					</div>
				</div>
				<Badge
					className={cn(
						"shrink-0 gap-1 border-none text-[11px]",
						template.status === "approved"
							? "bg-pons-accent/10 text-pons-accent"
							: template.status === "rejected"
								? "bg-destructive/10 text-destructive"
								: "bg-muted text-muted-foreground",
					)}
					variant="outline"
				>
					<StatusIcon className="h-3 w-3" />
					{statusConfig.label}
				</Badge>
			</div>

			{/* Template preview */}
			<div className="mt-3 space-y-1.5">
				{headerComponent?.text && (
					<p className="font-medium text-foreground text-xs">
						{headerComponent.text}
					</p>
				)}
				{headerComponent?.format && headerComponent.format !== "TEXT" && (
					<p className="text-muted-foreground text-xs italic">
						[{headerComponent.format}]
					</p>
				)}
				{bodyComponent?.text && (
					<p className="whitespace-pre-wrap text-muted-foreground text-xs leading-relaxed">
						{bodyComponent.text}
					</p>
				)}
				{footerComponent?.text && (
					<p className="text-[11px] text-muted-foreground/60">
						{footerComponent.text}
					</p>
				)}
				{buttonsComponent?.buttons && buttonsComponent.buttons.length > 0 && (
					<div className="flex flex-wrap gap-1.5 pt-1">
						{buttonsComponent.buttons.map((btn) => (
							<span
								className="rounded border px-2 py-0.5 text-[11px] text-muted-foreground"
								key={btn.text}
							>
								{btn.text}
							</span>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default function TemplatesPage() {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;
	const fetchTemplates = useAction(api.whatsapp.fetchTemplatesUI);

	const [templates, setTemplates] = useState<Template[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		setLoading(true);
		setError(null);
		fetchTemplates({ accountId })
			.then(setTemplates)
			.catch((err) =>
				setError(
					err instanceof Error ? err.message : "Failed to load templates",
				),
			)
			.finally(() => setLoading(false));
	}, [fetchTemplates, accountId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: load on mount
	useEffect(() => {
		load();
	}, [accountId]);

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<Loader2 className="h-5 w-5 animate-spin text-pons-accent" />
					<p className="text-muted-foreground text-sm">
						Fetching templates from Meta...
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<AlertTriangle className="h-5 w-5 text-destructive" />
					<p className="text-destructive text-sm">{error}</p>
					<Button onClick={load} size="sm" variant="outline">
						Retry
					</Button>
				</div>
			</div>
		);
	}

	const approved = templates?.filter((t) => t.status === "approved") ?? [];
	const other = templates?.filter((t) => t.status !== "approved") ?? [];

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
				<div>
					<h1 className="font-display font-semibold text-foreground text-lg tracking-tight">
						Message Templates
					</h1>
					<p className="text-muted-foreground text-xs">
						{templates?.length ?? 0} template
						{templates?.length === 1 ? "" : "s"} from Meta
					</p>
				</div>
				<Button onClick={load} size="sm" variant="outline">
					Refresh
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-6">
				{!templates || templates.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 py-16">
						<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
							<FileText className="h-6 w-6 text-muted-foreground" />
						</div>
						<div className="text-center">
							<p className="font-medium text-foreground text-sm">
								No templates yet
							</p>
							<p className="mt-1 text-muted-foreground text-xs">
								Create templates in{" "}
								<a
									className="text-pons-accent underline hover:text-pons-accent-bright"
									href="https://business.facebook.com/latest/whatsapp_manager/message_templates"
									rel="noopener noreferrer"
									target="_blank"
								>
									Meta Business Suite
								</a>
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-6">
						{approved.length > 0 && (
							<section>
								<h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Approved ({approved.length})
								</h2>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{approved.map((t) => (
										<TemplateCard key={t.id} template={t} />
									))}
								</div>
							</section>
						)}
						{other.length > 0 && (
							<section>
								<h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
									Other ({other.length})
								</h2>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{other.map((t) => (
										<TemplateCard key={t.id} template={t} />
									))}
								</div>
							</section>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
