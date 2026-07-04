import { NextResponse } from "next/server";

export interface HttpErrorData {
  fix?: string;
  why?: string;
  [key: string]: unknown;
}

export class HttpError extends Error {
  status: number;
  data?: HttpErrorData;

  constructor(status: number, message: string, data?: HttpErrorData) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export function httpError(
  status: number,
  message: string,
  data?: HttpErrorData
): HttpError {
  return new HttpError(status, message, data);
}

/** Converts a thrown error into a JSON response. Mirrors the Nuxt `createError` shape. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json(
      {
        statusCode: error.status,
        statusMessage: error.message,
        data: error.data,
      },
      { status: error.status }
    );
  }

  const message =
    error instanceof Error ? error.message : "Internal Server Error";
  return NextResponse.json(
    { statusCode: 500, statusMessage: message },
    { status: 500 }
  );
}
