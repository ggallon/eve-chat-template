export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function formatResponseError(status: number, body: string) {
  if (body.length > 0) {
    try {
      const parsed = JSON.parse(body) as { readonly error?: unknown };

      if (typeof parsed.error === "string") {
        return parsed.error;
      }
    } catch {}

    return body;
  }

  return `Server returned ${status}.`;
}

export async function readResponseError(response: Response) {
  return formatResponseError(response.status, await response.text());
}
