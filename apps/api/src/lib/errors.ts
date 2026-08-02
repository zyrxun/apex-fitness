export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new ApiError(400, code, message, details);
export const unauthorized = (code = 'unauthorized', message = 'Authentication required') =>
  new ApiError(401, code, message);
export const forbidden = (code = 'forbidden', message = 'Not allowed') =>
  new ApiError(403, code, message);
export const notFound = (code = 'not_found', message = 'Not found') =>
  new ApiError(404, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const notImplemented = (code: string, message: string) => new ApiError(501, code, message);
