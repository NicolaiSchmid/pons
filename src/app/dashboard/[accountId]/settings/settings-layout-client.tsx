"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../../convex/_generated/dataModel";

const SETTINGS_ITEMS = [
	{ slug: "general", label: "General" },
	{ slug: "webhooks", label: "Webhooks" },
	{ slug: "whatsapp_settings", label: "WhatsApp Settings" },
	{ slug: "danger", label: "Danger" },
] as const;

export function SettingsLayoutClient({
	accountId,
	children,
}: {
	accountId: Id<"accounts">;
	children: React.ReactNode;
}) {
	const pathname = usePathname();

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl gap-6 overflow-hidden p-6">
			<aside className="w-52 shrink-0">
				<div className="rounded-lg border bg-card p-2">
					{SETTINGS_ITEMS.map((item) => {
						const href = `/dashboard/${accountId}/settings/${item.slug}`;
						const active = pathname === href;
						return (
							<Link
								className={cn(
									"block rounded-md px-3 py-2 text-sm transition-colors",
									active
										? "bg-pons-accent/10 text-pons-accent"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
								href={href}
								key={item.slug}
							>
								{item.label}
							</Link>
						);
					})}
				</div>
			</aside>
			<main className="min-w-0 flex-1 overflow-hidden">{children}</main>
		</div>
	);
}
