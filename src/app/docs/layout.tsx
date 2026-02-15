import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<RootProvider
			theme={{
				enabled: false, // Dark-only app, no theme toggle
				defaultTheme: "dark",
			}}
		>
			<DocsLayout
				links={[
					{
						text: "GitHub",
						url: "https://github.com/NicolaiSchmid/pons",
						external: true,
					},
				]}
				nav={{
					title: (
						<div className="flex items-center gap-2">
							<div className="flex h-6 w-6 items-center justify-center rounded-md bg-pons-green/10 ring-1 ring-pons-green/20">
								<MessageSquare className="h-3.5 w-3.5 text-pons-green" />
							</div>
							<span className="font-display font-semibold text-sm tracking-tight">
								Pons
							</span>
						</div>
					),
					url: "/",
				}}
				tree={source.getPageTree()}
			>
				{children}
			</DocsLayout>
		</RootProvider>
	);
}
