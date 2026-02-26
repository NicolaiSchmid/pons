"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { api } from "../../convex/_generated/api";

interface AccountSelectorPreloadedProps {
	selectedAccountId?: string;
	onSelectAccount: (accountId: string) => void;
	onAddAccount?: () => void;
	preloadedAccounts: Preloaded<typeof api.accounts.list>;
}

/** Shared rendering logic for account selector */
function AccountSelectorContent({
	accounts,
	selectedAccountId,
	onSelectAccount,
	onAddAccount,
}: {
	accounts: FunctionReturnType<typeof api.accounts.list>;
	selectedAccountId?: string;
	onSelectAccount: (accountId: string) => void;
	onAddAccount?: () => void;
}) {
	if (accounts.length === 0) {
		return null;
	}

	const selected = accounts.find((a) => a?._id === selectedAccountId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					className="h-7 gap-1.5 px-2 text-muted-foreground text-xs hover:text-foreground"
					size="sm"
					variant="ghost"
				>
					{selected?.name ?? "Select account"}
					<ChevronDown className="h-3 w-3 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{accounts.map((account) =>
					account ? (
						<DropdownMenuItem
							className="flex items-center justify-between"
							key={account._id}
							onClick={() => onSelectAccount(account._id)}
						>
							<div className="flex items-center gap-2">
								<span className="font-medium">{account.name}</span>
								{account.phoneNumber && (
									<span className="font-mono text-muted-foreground text-xs">
										{account.phoneNumber}
									</span>
								)}
							</div>
							{selectedAccountId === account._id && (
								<Check className="h-3.5 w-3.5 text-pons-accent" />
							)}
						</DropdownMenuItem>
					) : null,
				)}
				{onAddAccount ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onAddAccount}>
							<Plus className="h-3.5 w-3.5" />
							Add account
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * AccountSelectorPreloaded — uses server-preloaded accounts data.
 * Data is immediately available on first render (no loading state).
 */
export function AccountSelectorPreloaded({
	selectedAccountId,
	onSelectAccount,
	onAddAccount,
	preloadedAccounts,
}: AccountSelectorPreloadedProps) {
	const accounts = usePreloadedQuery(preloadedAccounts);

	return (
		<AccountSelectorContent
			accounts={accounts}
			onAddAccount={onAddAccount}
			onSelectAccount={onSelectAccount}
			selectedAccountId={selectedAccountId}
		/>
	);
}
