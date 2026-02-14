"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface AccountSelectorProps {
	selectedAccountId?: Id<"accounts">;
	onSelectAccount: (accountId: Id<"accounts">) => void;
}

export function AccountSelector({
	selectedAccountId,
	onSelectAccount,
}: AccountSelectorProps) {
	const accounts = useQuery(api.accounts.list);

	if (!accounts) {
		return <div className="text-slate-400">Loading accounts...</div>;
	}

	if (accounts.length === 0) {
		return null;
	}

	if (accounts.length === 1) {
		// Auto-select single account
		if (!selectedAccountId && accounts[0]) {
			onSelectAccount(accounts[0]._id);
		}
		return (
			<div className="text-slate-300 text-sm">
				{accounts[0]?.name ?? "Account"} • {accounts[0]?.phoneNumber ?? ""}
			</div>
		);
	}

	return (
		<select
			className="rounded bg-slate-700 px-3 py-1 text-sm text-white outline-none ring-emerald-500 focus:ring-2"
			onChange={(e) => onSelectAccount(e.target.value as Id<"accounts">)}
			value={selectedAccountId ?? ""}
		>
			<option value="">Select account...</option>
			{accounts.map((account) =>
				account ? (
					<option key={account._id} value={account._id}>
						{account.name} • {account.phoneNumber}
					</option>
				) : null,
			)}
		</select>
	);
}
