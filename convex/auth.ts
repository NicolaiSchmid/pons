import Facebook from "@auth/core/providers/facebook";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Facebook({
			authorization: {
				params: {
					scope: [
						"email",
						"public_profile",
						"business_management",
						"whatsapp_business_management",
						"whatsapp_business_messaging",
					].join(","),
					config_id: "1198829922325154",
				},
			},
		}),
	],
});
