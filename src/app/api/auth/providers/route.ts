import { NextResponse } from "next/server";

export const revalidate = 86400;

export async function GET() {
  const authAvailable = Boolean(process.env.DATABASE_URL);
  return NextResponse.json(
    {
      google: Boolean(
        authAvailable && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      github: Boolean(
        authAvailable && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ),
      magicLink: Boolean(authAvailable && process.env.RESEND_API_KEY),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      },
    }
  );
}
