export type ErrorCode = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "VALIDATION";

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 422,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() {
    return STATUS[this.code];
  }
}

export const notFound = (what = "Data") => new AppError("NOT_FOUND", `${what} tidak ditemukan`);
export const forbidden = (msg = "Anda tidak memiliki akses untuk aksi ini") => new AppError("FORBIDDEN", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const badRequest = (msg: string) => new AppError("BAD_REQUEST", msg);
