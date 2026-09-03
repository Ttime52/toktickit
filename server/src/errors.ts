import type { Response } from "express";

export type ApiErrorFields = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: ApiErrorFields;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: ApiErrorFields,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function sendApiError(res: Response, error: unknown) {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.fields === undefined ? {} : { fields: error.fields }),
      },
    });
    return;
  }

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Unable to complete the request.",
    },
  });
}

export function validationError(
  fields: ApiErrorFields,
  message = "Request validation failed.",
) {
  return new ApiError(400, "VALIDATION_ERROR", message, fields);
}
