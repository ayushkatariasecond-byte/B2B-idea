import sgMail from '@sendgrid/mail';
import { env } from './env';

/**
 * Transactional email via SendGrid. Guarded and defensive:
 * - If SENDGRID_API_KEY is unset, emails are logged instead of sent (local dev never breaks).
 * - Sends are fire-and-forget and never throw into a request handler — a mail failure must
 *   never fail the underlying action (signup, invite, etc.).
 */
const ready = Boolean(env.sendgridApiKey);
if (ready) sgMail.setApiKey(env.sendgridApiKey);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!ready) {
    console.log(`[email] (SENDGRID_API_KEY unset — not sent) "${opts.subject}" → ${opts.to}`);
    return;
  }
  try {
    await sgMail.send({
      to: opts.to,
      from: { email: env.emailFrom, name: env.emailFromName },
      subject: opts.subject,
      text: stripHtml(opts.html),
      html: opts.html,
    });
  } catch (err) {
    console.error('[email] send failed', err);
  }
}

const shell = (inner: string) => `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
    <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:20px;">verve<span style="color:#c58300;">.</span></div>
    ${inner}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;color:#8d8371;font-size:12px;">You're receiving this because you have a Verve account.</div>
  </div>`;

export function sendWelcomeEmail(business: { email: string; name: string }): Promise<void> {
  return sendEmail({
    to: business.email,
    subject: `Welcome to Verve, ${business.name}`,
    html: shell(`
      <p style="font-size:16px;line-height:1.5;">Your page <b>${business.name}</b> is live.</p>
      <p style="font-size:15px;line-height:1.6;color:#3a3426;">Post your first short video, and Verve's creativity score will start ranking it by real engagement — reach that rewards good work instead of burying it.</p>
      <a href="${env.appWebUrl}" style="display:inline-block;margin-top:12px;padding:11px 20px;border-radius:100px;background:linear-gradient(135deg,#e3b842,#c58300);color:#fff;font-weight:700;text-decoration:none;">Open Verve</a>`),
  });
}

export function sendTeamInviteEmail(opts: { to: string; tempPassword: string; teamName: string }): Promise<void> {
  return sendEmail({
    to: opts.to,
    subject: `You've been added to ${opts.teamName} on Verve`,
    html: shell(`
      <p style="font-size:16px;line-height:1.5;">You've been invited to help run <b>${opts.teamName}</b> on Verve.</p>
      <p style="font-size:15px;line-height:1.6;color:#3a3426;">Sign in with this email and the temporary password below, then change it from Settings.</p>
      <div style="margin:14px 0;padding:12px 16px;background:#f3f2ee;border-radius:10px;font-family:ui-monospace,monospace;font-size:15px;">${opts.tempPassword}</div>
      <a href="${env.appWebUrl}/login" style="display:inline-block;margin-top:8px;padding:11px 20px;border-radius:100px;background:linear-gradient(135deg,#e3b842,#c58300);color:#fff;font-weight:700;text-decoration:none;">Sign in</a>`),
  });
}
