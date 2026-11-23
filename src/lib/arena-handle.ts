export function isArenaHandleConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ("constraint" in error && error.constraint === "amber_handle_owner") return true;
  return error.cause ? isArenaHandleConflict(error.cause) : false;
}
