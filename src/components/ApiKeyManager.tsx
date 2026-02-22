"use client";

import {
	type Preloaded,
	useAction,
	useMutation,
	usePreloadedQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	Check,
	CheckCircle2,
	Copy,
	KeyRound,
	Loader2,
	Plus,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const AVAILABLE_SCOPES = [
	{
		id: "read",
		label: "Read",
		description: "View conversations and messages",
	},
	{
		id: "write",
		label: "Write",
		description: "Mark as read, react to messages",
	},
	{
		id: "send",
		label: "Send",
		description: "Send messages and templates",
	},
];

/** SSR version: uses usePreloadedQuery for instant render with real-time takeover */
export function ApiKeyManagerPreloaded({
	preloadedApiKeys,
}: {
	preloadedApiKeys: Preloaded<typeof api.mcp.listApiKeys>;
}) {
	const apiKeys = usePreloadedQuery(preloadedApiKeys);

	return <ApiKeyManagerContent apiKeys={apiKeys} />;
}

/** Shared rendering logic */
function ApiKeyManagerContent({
	apiKeys,
}: {
	apiKeys: FunctionReturnType<typeof api.mcp.listApiKeys>;
}) {
	const createApiKey = useAction(api.mcp.createApiKey);
	const revokeApiKey = useMutation(api.mcp.revokeApiKey);

	const [showCreate, setShowCreate] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
		"read",
		"write",
		"send",
	]);
	const [expiresInDays, setExpiresInDays] = useState<string>("");
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const handleCreate = async () => {
		if (!newKeyName.trim()) {
			setError("Name is required");
			return;
		}
		if (newKeyScopes.length === 0) {
			setError("At least one scope is required");
			return;
		}

		setCreating(true);
		setError(null);

		try {
			const { apiKey } = await createApiKey({
				name: newKeyName.trim(),
				scopes: newKeyScopes,
				expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
			});
			setNewlyCreatedKey(apiKey);
			setShowCreate(false);
			setNewKeyName("");
			setNewKeyScopes(["read", "write", "send"]);
			setExpiresInDays("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create API key");
		} finally {
			setCreating(false);
		}
	};

	const handleRevoke = async (keyId: Id<"apiKeys">) => {
		if (
			!confirm(
				"Are you sure you want to revoke this API key? This cannot be undone.",
			)
		) {
			return;
		}
		try {
			await revokeApiKey({ keyId });
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to revoke API key");
		}
	};

	const handleCopy = () => {
		if (newlyCreatedKey) {
			navigator.clipboard.writeText(newlyCreatedKey);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const toggleScope = (scope: string) => {
		setNewKeyScopes((prev) =>
			prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
		);
	};

	return (
		<div className="mx-auto h-full max-w-2xl overflow-y-auto p-6">
			<div className="mb-6">
				<h1 className="flex items-center gap-2 font-display font-semibold text-lg">
					<KeyRound className="h-4 w-4 text-pons-accent" />
					API Keys
				</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Create and manage API keys for MCP client access.
				</p>
			</div>

			<div className="space-y-6">
				{/* Newly created key alert */}
				{newlyCreatedKey && (
					<div className="rounded-lg border border-pons-accent/30 bg-pons-accent-surface p-4">
						<div className="mb-2 flex items-center gap-2 font-medium text-pons-accent text-sm">
							<CheckCircle2 className="h-4 w-4" />
							API Key Created
						</div>
						<p className="mb-3 text-muted-foreground text-xs">
							Copy this key now. You won&apos;t be able to see it again.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 overflow-x-auto rounded-md bg-background px-3 py-2 font-mono text-pons-accent text-xs">
								{newlyCreatedKey}
							</code>
							<Button
								className="shrink-0 gap-1.5"
								onClick={handleCopy}
								size="sm"
								variant="secondary"
							>
								{copied ? (
									<Check className="h-3.5 w-3.5" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
								{copied ? "Copied" : "Copy"}
							</Button>
						</div>
						<button
							className="mt-3 text-muted-foreground text-xs transition hover:text-foreground"
							onClick={() => setNewlyCreatedKey(null)}
							type="button"
						>
							Dismiss
						</button>
					</div>
				)}

				{/* Error */}
				{error && (
					<div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
						{error}
					</div>
				)}

				{/* Create form */}
				{showCreate ? (
					<div className="rounded-lg border bg-card p-4">
						<h3 className="mb-4 font-medium text-sm">Create New API Key</h3>

						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="key-name">Name</Label>
								<Input
									id="key-name"
									onChange={(e) => setNewKeyName(e.target.value)}
									placeholder="e.g., Claude Desktop, Cursor, CI/CD"
									value={newKeyName}
								/>
							</div>

							<fieldset className="space-y-3">
								<Label asChild>
									<legend>Scopes</legend>
								</Label>
								{AVAILABLE_SCOPES.map((scope) => (
									<label
										className="flex cursor-pointer items-center gap-3"
										htmlFor={`scope-${scope.id}`}
										key={scope.id}
									>
										<Checkbox
											checked={newKeyScopes.includes(scope.id)}
											id={`scope-${scope.id}`}
											onCheckedChange={() => toggleScope(scope.id)}
										/>
										<span className="text-foreground text-sm">
											{scope.label}
										</span>
										<span className="text-muted-foreground text-xs">
											— {scope.description}
										</span>
									</label>
								))}
							</fieldset>

							<div className="space-y-2">
								<Label htmlFor="expires">Expires In</Label>
								<Select onValueChange={setExpiresInDays} value={expiresInDays}>
									<SelectTrigger className="w-full" id="expires">
										<SelectValue placeholder="Never" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="never">Never</SelectItem>
										<SelectItem value="7">7 days</SelectItem>
										<SelectItem value="30">30 days</SelectItem>
										<SelectItem value="90">90 days</SelectItem>
										<SelectItem value="365">1 year</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex gap-2 pt-1">
								<Button
									className="bg-pons-accent text-primary-foreground hover:bg-pons-accent-bright"
									disabled={creating}
									onClick={handleCreate}
									size="sm"
								>
									{creating ? (
										<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
									) : null}
									{creating ? "Creating..." : "Create Key"}
								</Button>
								<Button
									onClick={() => setShowCreate(false)}
									size="sm"
									variant="ghost"
								>
									Cancel
								</Button>
							</div>
						</div>
					</div>
				) : (
					<Button
						className="w-fit gap-1.5"
						onClick={() => setShowCreate(true)}
						size="sm"
						variant="secondary"
					>
						<Plus className="h-3.5 w-3.5" />
						Create New API Key
					</Button>
				)}

				<Separator />

				{/* Existing keys */}
				<div>
					<h3 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Existing Keys
					</h3>
					{apiKeys.length === 0 ? (
						<div className="rounded-lg border border-dashed p-6 text-center">
							<KeyRound className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
							<p className="text-muted-foreground text-sm">No API keys yet</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								Create one to use with MCP clients
							</p>
						</div>
					) : (
						<div className="space-y-2">
							{apiKeys.map((key) => (
								<div
									className="flex items-center justify-between rounded-lg border bg-card p-3"
									key={key._id}
								>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-foreground text-sm">
												{key.name}
											</span>
											<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
												{key.keyPrefix}...
											</code>
										</div>
										<div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
											<span className="flex gap-1">
												{key.scopes.map((s) => (
													<Badge
														className="px-1.5 py-0 text-[10px]"
														key={s}
														variant="secondary"
													>
														{s}
													</Badge>
												))}
											</span>
											<span>·</span>
											<span>{formatDate(key._creationTime)}</span>
											{key.lastUsedAt && (
												<>
													<span>·</span>
													<span>Used {formatDate(key.lastUsedAt)}</span>
												</>
											)}
											{key.expiresAt && (
												<>
													<span>·</span>
													<span
														className={
															key.expiresAt < Date.now()
																? "text-destructive"
																: ""
														}
													>
														{key.expiresAt < Date.now()
															? "Expired"
															: `Expires ${formatDate(key.expiresAt)}`}
													</span>
												</>
											)}
										</div>
									</div>
									<Button
										className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
										onClick={() => handleRevoke(key._id)}
										size="icon"
										variant="ghost"
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							))}
						</div>
					)}
				</div>

				<Separator />

				{/* MCP Config */}
				<McpConfigSnippet />
			</div>
		</div>
	);
}

function McpConfigSnippet() {
	const [copied, setCopied] = useState(false);

	const snippet = `{
  "mcpServers": {
    "pons": {
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;

	const handleCopy = async () => {
		await navigator.clipboard.writeText(snippet);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="rounded-lg border bg-card p-4">
			<h3 className="mb-1 font-medium text-sm">MCP Configuration</h3>
			<p className="mb-3 text-muted-foreground text-xs">
				Add this to your Claude Desktop or Cursor config:
			</p>
			<div className="relative">
				<pre className="overflow-x-auto rounded-md bg-background p-3 pr-10 font-mono text-foreground text-xs leading-relaxed">
					{snippet}
				</pre>
				<Button
					className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-foreground"
					onClick={handleCopy}
					size="icon"
					variant="ghost"
				>
					{copied ? (
						<Check className="h-3.5 w-3.5 text-pons-accent" />
					) : (
						<Copy className="h-3.5 w-3.5" />
					)}
				</Button>
			</div>
		</div>
	);
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
