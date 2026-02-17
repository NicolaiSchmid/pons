/**
 * Email sending via Resend.
 *
 * Used for token expiry warnings and other transactional emails.
 */

import { v } from "convex/values";
import { Resend } from "resend";
import { internalAction } from "./_generated/server";

const FROM = "Pons <noreply@pons.chat>";

export const sendTokenExpiryWarning = internalAction({
	args: {
		to: v.string(),
		userName: v.string(),
		timeLeft: v.string(), // e.g. "14 days", "1 hour", "5 minutes"
		reAuthUrl: v.string(),
	},
	handler: async (_ctx, args) => {
		const resend = new Resend(process.env.RESEND_API_KEY);

		const { error } = await resend.emails.send({
			from: FROM,
			to: args.to,
			subject: `⚠️ Pons: Your session expires in ${args.timeLeft}`,
			html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:12px;border:1px solid #262626;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;">
              <span style="color:#4ade80;font-size:13px;font-weight:600;letter-spacing:0.5px;">PONS</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <h1 style="margin:0 0 16px;color:#fafafa;font-size:20px;font-weight:600;line-height:1.3;">
                Your session expires in ${args.timeLeft}
              </h1>
              <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.6;">
                Hi ${args.userName},<br><br>
                Your Facebook authentication for Pons will expire in <strong style="color:#fafafa;">${args.timeLeft}</strong>.
                Once it expires, you won't be able to send messages or receive media — incoming text messages will still be stored, but nothing else will work.
              </p>
              <p style="margin:0 0 28px;color:#a1a1aa;font-size:14px;line-height:1.6;">
                Click below to re-authenticate. It takes 5 seconds.
              </p>
              <!-- CTA -->
              <a href="${args.reAuthUrl}" style="display:inline-block;background:#4ade80;color:#0a0a0a;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
                Re-authenticate now
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #262626;">
              <p style="margin:0;color:#525252;font-size:12px;line-height:1.5;">
                This is an automated message from <a href="https://pons.chat" style="color:#525252;text-decoration:underline;">pons.chat</a>.
                You're receiving this because you have an active Pons account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim(),
		});

		if (error) {
			console.error("Failed to send token expiry email:", error);
			throw new Error(`Resend error: ${error.message}`);
		}
	},
});
