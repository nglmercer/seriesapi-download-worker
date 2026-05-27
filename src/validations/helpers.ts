import { z } from "zod";

export interface ValidationResult<T> {
  success: true;
  data: T;
}

export interface ValidationFailure {
  success: false;
  error: string;
  issues: z.ZodIssue[];
}

export type ValidatedResult<T> = ValidationResult<T> | ValidationFailure;

export function validate<T>(schema: z.ZodType<T>, data: unknown): ValidatedResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const firstIssue = result.error.issues[0];
  const path = firstIssue.path.length > 0 ? `${firstIssue.path.join(".")}: ` : "";
  return {
    success: false,
    error: `${path}${firstIssue.message}`,
    issues: result.error.issues,
  };
}

export function validateOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(data);
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function validationErrorResponse(error: string, issues?: z.ZodIssue[]): Response {
  return jsonResponse(
    {
      error,
      details: issues?.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    400
  );
}

export async function parseJsonBody<T>(
  req: Request,
  schema: z.ZodType<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  try {
    const body = await req.json();
    const result = validate(schema, body);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      response: validationErrorResponse(result.error, result.issues),
    };
  } catch {
    return {
      success: false,
      response: jsonResponse({ error: "Invalid JSON body" }, 400),
    };
  }
}

export function parseQueryParams<T>(
  url: URL,
  schema: z.ZodType<T>
): { success: true; data: T } | { success: false; response: Response } {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = validate(schema, params);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    response: validationErrorResponse(result.error, result.issues),
  };
}
