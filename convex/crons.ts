import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check for expiring Facebook tokens every 5 minutes
crons.interval(
	"check-expiring-tokens",
	{ minutes: 5 },
	internal.tokenExpiry.checkExpiringTokens,
);

export default crons;
