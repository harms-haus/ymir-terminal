import { describe, test, expect } from "bun:test";
import {
  handleError,
  createErrorResponse,
  isErrorResponse,
} from "./error-handler";

// ---------------------------------------------------------------------------
// handleError
// ---------------------------------------------------------------------------

describe("handleError", () => {
  test("extracts message from Error objects", () => {
    const error = new Error("something went wrong");
    const result = handleError(error);

    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("something went wrong");
  });

  test("extracts message from string errors", () => {
    const result = handleError("plain string error");

    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("plain string error");
  });

  test("returns 'Internal error' for unknown types", () => {
    const result = handleError(42);

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toBe("Internal error");
  });

  test("returns 'Internal error' for null", () => {
    const result = handleError(null);

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toBe("Internal error");
  });

  test("returns 'Internal error' for undefined", () => {
    const result = handleError(undefined);

    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.message).toBe("Internal error");
  });

  test("extracts code and message from objects with code and message properties", () => {
    const error = { code: "NOT_FOUND", message: "Resource not found" };
    const result = handleError(error);

    expect(result.code).toBe("NOT_FOUND");
    expect(result.message).toBe("Resource not found");
  });

  test("preserves details from error-like objects", () => {
    const error = {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: { field: "email" },
    };
    const result = handleError(error);

    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toBe("Invalid input");
    expect(result.details).toEqual({ field: "email" });
  });
});

// ---------------------------------------------------------------------------
// createErrorResponse
// ---------------------------------------------------------------------------

describe("createErrorResponse", () => {
  test("creates a structured error object with code and message", () => {
    const result = createErrorResponse("NOT_FOUND", "Resource not found");

    expect(result).toEqual({
      code: "NOT_FOUND",
      message: "Resource not found",
    });
  });

  test("includes details when provided", () => {
    const details = { field: "username", constraint: "min:3" };
    const result = createErrorResponse("VALIDATION_ERROR", "Invalid input", details);

    expect(result).toEqual({
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details,
    });
  });

  test("does not include details when omitted", () => {
    const result = createErrorResponse("TIMEOUT", "Request timed out");

    expect(result).not.toHaveProperty("details");
    expect(result).toEqual({
      code: "TIMEOUT",
      message: "Request timed out",
    });
  });
});

// ---------------------------------------------------------------------------
// isErrorResponse
// ---------------------------------------------------------------------------

describe("isErrorResponse", () => {
  test("returns true for valid error response objects", () => {
    const data: unknown = { code: "NOT_FOUND", message: "Resource not found" };

    expect(isErrorResponse(data)).toBe(true);
  });

  test("returns false for null", () => {
    expect(isErrorResponse(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isErrorResponse(undefined)).toBe(false);
  });

  test("returns false for strings", () => {
    expect(isErrorResponse("error")).toBe(false);
  });

  test("returns false for numbers", () => {
    expect(isErrorResponse(123)).toBe(false);
  });

  test("returns false for objects missing code property", () => {
    const data: unknown = { message: "something" };

    expect(isErrorResponse(data)).toBe(false);
  });

  test("returns false for objects missing message property", () => {
    const data: unknown = { code: "ERROR" };

    expect(isErrorResponse(data)).toBe(false);
  });

  test("narrowing works — type guard allows access to properties", () => {
    const data: unknown = { code: "NOT_FOUND", message: "Resource not found" };

    if (isErrorResponse(data)) {
      // TypeScript should allow these property accesses
      expect(data.code).toBe("NOT_FOUND");
      expect(data.message).toBe("Resource not found");
    } else {
      expect.unreachable("Should have been an error response");
    }
  });

  test("returns true for full AppError with details", () => {
    const data: unknown = {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: { field: "email" },
    };

    expect(isErrorResponse(data)).toBe(true);
  });
});
