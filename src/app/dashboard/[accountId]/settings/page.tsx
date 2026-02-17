"use client";

import { useParams } from "next/navigation";
import { AccountSettings } from "@/components/AccountSettings";
import type { Id } from "../../../../../convex/_generated/dataModel";

export default function SettingsPage() {
	const params = useParams();
	const accountId = params.accountId as Id<"accounts">;

	return <AccountSettings accountId={accountId} />;
}
