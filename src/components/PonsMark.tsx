import { cn } from "@/lib/utils";

export function PonsMark({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			className={cn("shrink-0", className)}
			fill="none"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<rect
				fill="rgb(253 242 248)"
				height="18"
				rx="5"
				stroke="rgb(251 207 232)"
				strokeWidth="0.8"
				width="18"
				x="1"
				y="1"
			/>
			<path
				d="M5.75 7.5C5.75 6.53 6.53 5.75 7.5 5.75H12.5C13.47 5.75 14.25 6.53 14.25 7.5V10.5C14.25 11.47 13.47 12.25 12.5 12.25H9.9L7.9 13.75C7.32 14.18 6.5 13.76 6.5 13.03V12.25H7.5C6.53 12.25 5.75 11.47 5.75 10.5V7.5Z"
				stroke="rgb(236 72 153)"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.6"
			/>
		</svg>
	);
}
