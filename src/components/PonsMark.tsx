import { cn } from "@/lib/utils";

export function PonsMark({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("h-4 w-4", className)}
			fill="none"
			viewBox="0 0 24 24"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect
				fill="url(#pons-mark-bg)"
				height="20"
				rx="6"
				width="20"
				x="2"
				y="2"
			/>
			<rect
				fill="rgba(255,255,255,0.9)"
				height="8"
				rx="2.5"
				width="6.5"
				x="6"
				y="7"
			/>
			<rect
				fill="rgba(255,255,255,0.9)"
				height="10"
				rx="2.5"
				width="6.5"
				x="11.5"
				y="7"
			/>
			<defs>
				<linearGradient
					gradientUnits="userSpaceOnUse"
					id="pons-mark-bg"
					x1="2"
					x2="22"
					y1="2"
					y2="22"
				>
					<stop stopColor="#ff5ca8" />
					<stop offset="1" stopColor="#f97316" />
				</linearGradient>
			</defs>
		</svg>
	);
}
