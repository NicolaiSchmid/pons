import { MessageSquare } from "lucide-react";
import Link from "next/link";

interface NavbarProps {
	/** Right-side content (sign-in button, account controls, etc.) */
	children?: React.ReactNode;
	/** Left-side content after nav links (search toggle, sidebar trigger, etc.) */
	leftChildren?: React.ReactNode;
	/** Current active path for highlighting nav links */
	active?: "blog" | "github";
	/** Hide the nav links (Blog, GitHub) — used in the dashboard */
	hideNav?: boolean;
}

export function Navbar({
	children,
	leftChildren,
	active,
	hideNav,
}: NavbarProps) {
	return (
		<header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between border-border/60 border-b bg-background/80 px-4 backdrop-blur-xl">
			<div className="flex items-center gap-5">
				{/* Brand */}
				<Link className="flex items-center gap-2" href="/">
					<div className="flex h-7 w-7 items-center justify-center rounded-md bg-pons-accent/10 ring-1 ring-pons-accent/20">
						<MessageSquare className="h-3.5 w-3.5 text-pons-accent" />
					</div>
					<span className="font-display font-semibold text-sm tracking-tight">
						Pons
					</span>
				</Link>

				{/* Nav links */}
				{!hideNav && (
					<nav className="hidden items-center gap-1 sm:flex">
						<Link
							className={`rounded-md px-2.5 py-1.5 text-xs transition ${
								active === "blog"
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
							href="/blog"
						>
							Blog
						</Link>
						<a
							className={`rounded-md px-2.5 py-1.5 text-xs transition ${
								active === "github"
									? "text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
							href="https://github.com/NicolaiSchmid/pons"
							rel="noopener noreferrer"
							target="_blank"
						>
							GitHub
						</a>
					</nav>
				)}

				{leftChildren}
			</div>

			{children && <div className="flex items-center gap-1">{children}</div>}
		</header>
	);
}
