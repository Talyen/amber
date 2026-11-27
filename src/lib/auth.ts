import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendMagicLinkEmail({ email, url }: { email: string; url: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Email sign-in is not configured.");
  }
  const from = process.env.ALERT_FROM_EMAIL?.trim() || "Amber <alerts@amberstocks.com>";
  const safeUrl = escapeHtml(url);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Sign in to Amber",
      text: `Sign in to Amber with this one-time link (expires in 10 minutes):\n\n${url}\n\nIf you did not request this email, you can safely ignore it.`,
      html: `<div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827;">
        <div style="font-family:monospace;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#d97706;">AMBER</div>
        <h1 style="font-size:20px;margin:8px 0 12px;">Sign in to Amber</h1>
        <p style="font-size:14px;line-height:1.5;color:#4b5563;">Click the button below to sign in. This one-time link expires in 10 minutes.</p>
        <p style="margin:20px 0;"><a href="${safeUrl}" style="display:inline-block;background:#d97706;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">Sign in to Amber</a></p>
        <p style="font-size:12px;color:#6b7280;">If you did not request this link, you can safely ignore this email.</p>
      </div>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`Magic link email failed with status ${res.status}.`);
  }
}

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

function createAuthInstance() {
  const db = getDb();
  if (!db) {
    throw new Error("DATABASE_URL is required for authentication.");
  }

  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in production.");
  }

  return betterAuth({
    baseURL,
    secret: secret ?? "amber-local-dev-secret-only",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: false,
    },
    socialProviders,
    plugins: process.env.RESEND_API_KEY
      ? [
          magicLink({
            expiresIn: 600,
            sendMagicLink: async ({ email, url }) => {
              await sendMagicLinkEmail({ email, url });
            },
          }),
        ]
      : [],
  });
}

type AmberAuth = ReturnType<typeof createAuthInstance>;

let cachedAuth: AmberAuth | null = null;

export function getAuth(): AmberAuth {
  if (!cachedAuth) {
    cachedAuth = createAuthInstance();
  }
  return cachedAuth;
}
