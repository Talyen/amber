import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

function authUnavailable() {
  return Response.json({ error: "Sign-in is currently unavailable." }, { status: 503 });
}

export async function GET(request: Request) {
  if (!process.env.DATABASE_URL) {
    return new URL(request.url).pathname === "/api/auth/get-session"
      ? Response.json(null)
      : authUnavailable();
  }
  const handler = toNextJsHandler(getAuth());
  return handler.GET(request);
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return authUnavailable();
  const handler = toNextJsHandler(getAuth());
  return handler.POST(request);
}
