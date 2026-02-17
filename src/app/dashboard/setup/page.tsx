"use client";

import { useRouter } from "next/navigation";
import { SetupAccount } from "@/components/SetupAccount";

/**
 * /dashboard/setup — Connect a new WhatsApp Business account.
 */
export default function SetupPage() {
	const router = useRouter();

	return (
		<div className="flex-1 overflow-y-auto">
			<SetupAccount onComplete={() => router.push("/dashboard")} />
		</div>
	);
}
