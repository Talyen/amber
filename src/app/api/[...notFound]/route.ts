import { apiError } from "@/lib/public-api";

function notFoundResponse() {
  return apiError(404, "endpoint_not_found", "This API endpoint does not exist.", "Inspect /openapi.json or /docs for supported public endpoints.");
}

export const GET = notFoundResponse;
export const POST = notFoundResponse;
export const PUT = notFoundResponse;
export const PATCH = notFoundResponse;
export const DELETE = notFoundResponse;
