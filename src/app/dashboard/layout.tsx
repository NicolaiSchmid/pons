import { requireAuthenticatedUser } from "@/lib/auth-server";

/**
 * Dashboard layout — Server Component.
 *
 * Guards dashboard routes server-side and links the Better Auth user
 * to the existing app user record before child pages render.
 */
export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireAuthenticatedUser("/");

	return <div className="flex h-screen flex-col">{children}</div>;
}
