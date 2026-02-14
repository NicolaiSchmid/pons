"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

interface SetupAccountProps {
	onComplete: () => void;
}

export function SetupAccount({ onComplete }: SetupAccountProps) {
	const createAccount = useMutation(api.accounts.create);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [formData, setFormData] = useState({
		name: "",
		wabaId: "",
		phoneNumberId: "",
		phoneNumber: "",
		accessToken: "",
		webhookVerifyToken: "",
		appSecret: "",
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);

		try {
			await createAccount(formData);
			onComplete();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create account");
		} finally {
			setLoading(false);
		}
	};

	const generateToken = () => {
		const chars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let result = "";
		for (let i = 0; i < 32; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		setFormData((prev) => ({ ...prev, webhookVerifyToken: result }));
	};

	return (
		<div className="mx-auto max-w-lg p-6">
			<h2 className="mb-6 font-bold text-2xl text-white">
				Set up WhatsApp Business Account
			</h2>
			<p className="mb-6 text-slate-400">
				Connect your WhatsApp Business Account to start receiving and sending
				messages.
			</p>

			<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
				<div>
					<label className="mb-1 block text-slate-300 text-sm" htmlFor="name">
						Account Name
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="name"
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, name: e.target.value }))
						}
						placeholder="My Business"
						required
						type="text"
						value={formData.name}
					/>
				</div>

				<div>
					<label className="mb-1 block text-slate-300 text-sm" htmlFor="wabaId">
						WhatsApp Business Account ID
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="wabaId"
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, wabaId: e.target.value }))
						}
						placeholder="1234567890123456"
						required
						type="text"
						value={formData.wabaId}
					/>
					<p className="mt-1 text-slate-500 text-xs">
						Find this in Meta Business Suite → WhatsApp → API Setup
					</p>
				</div>

				<div>
					<label
						className="mb-1 block text-slate-300 text-sm"
						htmlFor="phoneNumberId"
					>
						Phone Number ID
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="phoneNumberId"
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								phoneNumberId: e.target.value,
							}))
						}
						placeholder="1234567890123456"
						required
						type="text"
						value={formData.phoneNumberId}
					/>
				</div>

				<div>
					<label
						className="mb-1 block text-slate-300 text-sm"
						htmlFor="phoneNumber"
					>
						Display Phone Number
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="phoneNumber"
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))
						}
						placeholder="+1 555 123 4567"
						required
						type="text"
						value={formData.phoneNumber}
					/>
				</div>

				<div>
					<label
						className="mb-1 block text-slate-300 text-sm"
						htmlFor="accessToken"
					>
						Access Token
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="accessToken"
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, accessToken: e.target.value }))
						}
						placeholder="EAAG..."
						required
						type="password"
						value={formData.accessToken}
					/>
					<p className="mt-1 text-slate-500 text-xs">
						Create a permanent token in System Users or use a temporary test
						token
					</p>
				</div>

				<div>
					<label
						className="mb-1 block text-slate-300 text-sm"
						htmlFor="webhookVerifyToken"
					>
						Webhook Verify Token
					</label>
					<div className="flex gap-2">
						<input
							className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
							id="webhookVerifyToken"
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									webhookVerifyToken: e.target.value,
								}))
							}
							placeholder="random-string-here"
							required
							type="text"
							value={formData.webhookVerifyToken}
						/>
						<button
							className="rounded-lg bg-slate-700 px-3 py-2 text-slate-300 text-sm transition hover:bg-slate-600"
							onClick={generateToken}
							type="button"
						>
							Generate
						</button>
					</div>
					<p className="mt-1 text-slate-500 text-xs">
						Use this token when setting up the webhook URL in Meta
					</p>
				</div>

				<div>
					<label
						className="mb-1 block text-slate-300 text-sm"
						htmlFor="appSecret"
					>
						App Secret
					</label>
					<input
						className="w-full rounded-lg bg-slate-800 px-4 py-2 text-white placeholder-slate-500 outline-none ring-emerald-500 focus:ring-2"
						id="appSecret"
						onChange={(e) =>
							setFormData((prev) => ({ ...prev, appSecret: e.target.value }))
						}
						placeholder="abc123..."
						required
						type="password"
						value={formData.appSecret}
					/>
					<p className="mt-1 text-slate-500 text-xs">
						Find this in your Meta App Settings → Basic
					</p>
				</div>

				{error && (
					<div className="rounded bg-red-900/50 px-3 py-2 text-red-300 text-sm">
						{error}
					</div>
				)}

				<button
					className="mt-4 rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
					disabled={loading}
					type="submit"
				>
					{loading ? "Creating..." : "Create Account"}
				</button>
			</form>
		</div>
	);
}
