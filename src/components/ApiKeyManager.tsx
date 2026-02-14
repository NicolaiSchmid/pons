"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface ApiKeyManagerProps {
	accountId: Id<"accounts">;
	onClose: () => void;
}

const AVAILABLE_SCOPES = [
	{ id: "read", label: "Read", description: "View conversations and messages" },
	{
		id: "write",
		label: "Write",
		description: "Mark as read, react to messages",
	},
	{ id: "send", label: "Send", description: "Send messages and templates" },
];

export function ApiKeyManager({ accountId, onClose }: ApiKeyManagerProps) {
	const apiKeys = useQuery(api.mcp.listApiKeys, { accountId });
	const createApiKey = useAction(api.mcp.createApiKey);
	const revokeApiKey = useMutation(api.mcp.revokeApiKey);

	const [showCreate, setShowCreate] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyScopes, setNewKeyScopes] = useState<string[]>([
		"read",
		"write",
		"send",
	]);
	const [expiresInDays, setExpiresInDays] = useState<number | undefined>(
		undefined,
	);
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
				accountId,
				name: newKeyName.trim(),
				scopes: newKeyScopes,
				expiresInDays,
			});
			setNewlyCreatedKey(apiKey);
			setShowCreate(false);
			setNewKeyName("");
			setNewKeyScopes(["read", "write", "send"]);
			setExpiresInDays(undefined);
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

	const formatDate = (timestamp: number) => {
		return new Date(timestamp).toLocaleDateString(undefined, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			<div className="mx-4 w-full max-w-2xl rounded-lg bg-slate-800 p-6">
				<div className="mb-6 flex items-center justify-between">
					<h2 className="font-bold text-white text-xl">API Keys</h2>
					<button
						aria-label="Close"
						className="text-slate-400 hover:text-white"
						onClick={onClose}
						type="button"
					>
						<svg
							aria-hidden="true"
							className="h-6 w-6"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M6 18L18 6M6 6l12 12"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
							/>
						</svg>
					</button>
				</div>

				{/* Newly created key alert */}
				{newlyCreatedKey && (
					<div className="mb-6 rounded-lg border border-emerald-500/50 bg-emerald-900/30 p-4">
						<div className="mb-2 flex items-center gap-2 font-medium text-emerald-300">
							<svg
								aria-hidden="true"
								className="h-5 w-5"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
								/>
							</svg>
							API Key Created
						</div>
						<p className="mb-3 text-slate-300 text-sm">
							Copy this key now. You won't be able to see it again.
						</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded bg-slate-900 px-3 py-2 font-mono text-emerald-400 text-sm">
								{newlyCreatedKey}
							</code>
							<button
								className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
								onClick={handleCopy}
								type="button"
							>
								{copied ? "Copied!" : "Copy"}
							</button>
						</div>
						<button
							className="mt-3 text-slate-400 text-sm hover:text-white"
							onClick={() => setNewlyCreatedKey(null)}
							type="button"
						>
							Dismiss
						</button>
					</div>
				)}

				{/* Error alert */}
				{error && (
					<div className="mb-4 rounded bg-red-900/50 px-3 py-2 text-red-300 text-sm">
						{error}
					</div>
				)}

				{/* Create form */}
				{showCreate ? (
					<div className="mb-6 rounded-lg border border-slate-700 p-4">
						<h3 className="mb-4 font-medium text-white">Create New API Key</h3>

						<div className="mb-4">
							<label
								className="mb-1 block text-slate-300 text-sm"
								htmlFor="key-name"
							>
								Name
							</label>
							<input
								className="w-full rounded bg-slate-900 px-3 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
								id="key-name"
								onChange={(e) => setNewKeyName(e.target.value)}
								placeholder="e.g., Claude Desktop, Cursor, CI/CD"
								type="text"
								value={newKeyName}
							/>
						</div>

						<fieldset className="mb-4">
							<legend className="mb-2 block text-slate-300 text-sm">
								Scopes
							</legend>
							<div className="space-y-2">
								{AVAILABLE_SCOPES.map((scope) => (
									<label
										className="flex cursor-pointer items-center gap-3"
										key={scope.id}
									>
										<input
											checked={newKeyScopes.includes(scope.id)}
											className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
											onChange={() => toggleScope(scope.id)}
											type="checkbox"
										/>
										<span className="text-white">{scope.label}</span>
										<span className="text-slate-400 text-sm">
											- {scope.description}
										</span>
									</label>
								))}
							</div>
						</fieldset>

						<div className="mb-4">
							<label
								className="mb-1 block text-slate-300 text-sm"
								htmlFor="expires"
							>
								Expires In
							</label>
							<select
								className="w-full rounded bg-slate-900 px-3 py-2 text-white outline-none ring-emerald-500 focus:ring-2"
								id="expires"
								onChange={(e) =>
									setExpiresInDays(
										e.target.value ? Number(e.target.value) : undefined,
									)
								}
								value={expiresInDays ?? ""}
							>
								<option value="">Never</option>
								<option value="7">7 days</option>
								<option value="30">30 days</option>
								<option value="90">90 days</option>
								<option value="365">1 year</option>
							</select>
						</div>

						<div className="flex gap-2">
							<button
								className="rounded bg-emerald-500 px-4 py-2 font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
								disabled={creating}
								onClick={handleCreate}
								type="button"
							>
								{creating ? "Creating..." : "Create Key"}
							</button>
							<button
								className="rounded bg-slate-700 px-4 py-2 text-white hover:bg-slate-600"
								onClick={() => setShowCreate(false)}
								type="button"
							>
								Cancel
							</button>
						</div>
					</div>
				) : (
					<button
						className="mb-6 flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 font-medium text-white hover:bg-emerald-600"
						onClick={() => setShowCreate(true)}
						type="button"
					>
						<svg
							aria-hidden="true"
							className="h-5 w-5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								d="M12 4v16m8-8H4"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
							/>
						</svg>
						Create New API Key
					</button>
				)}

				{/* Existing keys */}
				<div>
					<h3 className="mb-3 font-medium text-slate-300 text-sm">
						Existing Keys
					</h3>
					{!apiKeys ? (
						<div className="text-slate-400">Loading...</div>
					) : apiKeys.length === 0 ? (
						<div className="rounded border border-slate-700 border-dashed p-4 text-center text-slate-400">
							No API keys yet. Create one to use with MCP clients.
						</div>
					) : (
						<div className="space-y-3">
							{apiKeys.map((key) => (
								<div
									className="flex items-center justify-between rounded border border-slate-700 bg-slate-900/50 p-4"
									key={key._id}
								>
									<div>
										<div className="flex items-center gap-2">
											<span className="font-medium text-white">{key.name}</span>
											<code className="rounded bg-slate-800 px-2 py-0.5 font-mono text-slate-400 text-xs">
												{key.keyPrefix}...
											</code>
										</div>
										<div className="mt-1 flex items-center gap-3 text-slate-400 text-sm">
											<span>Scopes: {key.scopes.join(", ")}</span>
											<span>Created: {formatDate(key._creationTime)}</span>
											{key.lastUsedAt && (
												<span>Last used: {formatDate(key.lastUsedAt)}</span>
											)}
											{key.expiresAt && (
												<span
													className={
														key.expiresAt < Date.now() ? "text-red-400" : ""
													}
												>
													{key.expiresAt < Date.now()
														? "Expired"
														: `Expires: ${formatDate(key.expiresAt)}`}
												</span>
											)}
										</div>
									</div>
									<button
										className="rounded bg-red-900/50 px-3 py-1 text-red-300 text-sm hover:bg-red-900"
										onClick={() => handleRevoke(key._id)}
										type="button"
									>
										Revoke
									</button>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Usage instructions */}
				<div className="mt-6 rounded border border-slate-700 bg-slate-900/50 p-4">
					<h3 className="mb-2 font-medium text-slate-300 text-sm">
						MCP Configuration
					</h3>
					<p className="mb-3 text-slate-400 text-sm">
						Add this to your Claude Desktop or Cursor MCP config:
					</p>
					<pre className="overflow-x-auto rounded bg-slate-950 p-3 font-mono text-slate-300 text-xs">
						{`{
  "mcpServers": {
    "pons": {
      "url": "${typeof window !== "undefined" ? window.location.origin : "https://your-domain.com"}/api/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}
					</pre>
				</div>
			</div>
		</div>
	);
}
