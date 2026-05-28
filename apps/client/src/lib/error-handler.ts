export interface AppError {
  code: string;
  message: string;
  details?: unknown;
}

export function handleError(error: unknown): AppError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    "message" in error
  ) {
    return error as AppError;
  }
  if (error instanceof Error) {
    return { code: "UNKNOWN", message: error.message };
  }
  if (typeof error === "string") {
    return { code: "UNKNOWN", message: error };
  }
  return { code: "INTERNAL_ERROR", message: "Internal error" };
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
): AppError {
  if (details !== undefined) {
    return { code, message, details };
  }
  return { code, message };
}

export function isErrorResponse(data: unknown): data is AppError {
  return (
    !!data &&
    typeof data === "object" &&
    "code" in data &&
    "message" in data
  );
}
