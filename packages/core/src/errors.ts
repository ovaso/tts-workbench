import type { JsonValue } from "./json";

export type TTSErrorCode =
  | "provider_not_found"
  | "operation_not_supported"
  | "invalid_request"
  | "vendor_extension_required"
  | "vendor_execution_failed"
  | "archive_failed";

export class TTSError extends Error {
  readonly code: TTSErrorCode;
  readonly statusCode: number;
  readonly details?: JsonValue;

  constructor(message: string, code: TTSErrorCode, statusCode = 400, details?: JsonValue) {
    super(message);
    this.name = "TTSError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}
