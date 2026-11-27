import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/site";

function notFoundResponse(request: NextRequest) {
  const { pathname } = request.nextUrl;
  return NextResponse.json(
    {
      type: `${SITE_URL}/docs#errors`,
      title: "Endpoint Not Found",
      status: 404,
      code: "endpoint_not_found",
      error: `API endpoint ${pathname} does not exist.`,
      message: `API endpoint ${pathname} does not exist.`,
      resolution: `Inspect ${SITE_URL}/openapi.json or ${SITE_URL}/docs for valid public endpoints.`,
    },
    {
      status: 404,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "X-API-Version": "1.0",
        "RateLimit-Policy": "120;w=60",
        "RateLimit-Limit": "120",
        "RateLimit-Remaining": "119",
      },
    }
  );
}

export const GET = notFoundResponse;
export const POST = notFoundResponse;
export const PUT = notFoundResponse;
export const PATCH = notFoundResponse;
export const DELETE = notFoundResponse;
