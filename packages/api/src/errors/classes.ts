export type ErrorCode =
  | "VALIDATION_FAILED"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_CONFLICT"
  | "INTERNAL_ERROR";

export interface ErrorDetails {
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly errorCode: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;

  constructor(
    errorCode: ErrorCode,
    message: string,
    statusCode: number,
    details?: ErrorDetails,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(
    message: string = "対象のデータが存在しません",
    details?: ErrorDetails,
    cause?: unknown,
  ) {
    super("RESOURCE_NOT_FOUND", message, 404, details, cause);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = "重複したデータが存在します",
    details?: ErrorDetails,
    cause?: unknown,
  ) {
    super("RESOURCE_CONFLICT", message, 409, details, cause);
  }
}

export class InternalError extends AppError {
  constructor(
    message: string = "システムエラーが発生しました",
    details?: ErrorDetails,
    cause?: unknown,
  ) {
    super("INTERNAL_ERROR", message, 500, details, cause);
  }
}
