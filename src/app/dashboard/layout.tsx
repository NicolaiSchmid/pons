/**
 * Dashboard layout — Server Component.
 *
 * Auth is handled by middleware (redirects to / if unauthenticated),
 * so no client-side auth gate or spinner needed here.
 */
export default function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <div className="flex h-screen flex-col">{children}</div>;
}
