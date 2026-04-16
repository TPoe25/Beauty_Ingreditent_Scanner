export function getDatabaseErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("planLimitReached")) {
    return "Account creation is temporarily unavailable because the database service has reached its current plan limit.";
  }

  if (message.includes("Failed to identify your database")) {
    return "Account creation is temporarily unavailable because the database connection is currently restricted.";
  }

  return null;
}
