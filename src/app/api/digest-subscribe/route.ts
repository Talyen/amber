import { NextResponse } from "next/server";

export function POST() {
  return NextResponse.json(
    { error: "Email subscriptions are currently unavailable.", rssUrl: "/feed.xml" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
