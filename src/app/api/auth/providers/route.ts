import { NextResponse } from "next/server";

export async function GET() {
  const authAvailable = Boolean(process.env.DATABASE_URL);
  return NextResponse.json({
    google: Boolean(
      authAvailable && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    github: Boolean(
      authAvailable && process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ),
  });
}
