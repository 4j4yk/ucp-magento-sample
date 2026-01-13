// Lightweight error type that carries an HTTP status code for centralized handling.
export class HttpError extends Error {
  status: number;

  // Accepts a status and message so callers can throw domain-specific HTTP errors.
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
