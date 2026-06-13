export class StessaClientError extends Error {
  readonly httpStatus: number;

  constructor(httpStatus: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StessaClientError";
    this.httpStatus = httpStatus;
  }
}
