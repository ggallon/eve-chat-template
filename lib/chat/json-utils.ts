import type { HandleMessageStreamEvent } from "eve/client";

export function areEqualJsonValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (
      !(Array.isArray(left) && Array.isArray(right)) ||
      left.length !== right.length
    ) {
      return false;
    }

    return left.every((item, index) => areEqualJsonValues(item, right[index]));
  }

  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.hasOwn(rightRecord, key) &&
      areEqualJsonValues(leftRecord[key], rightRecord[key])
  );
}

/**
 * from : https://github.com/vercel/eve/blob/210f097917cf780075694bec5b94734069282c39/packages/eve/src/client/ndjson.ts#L35-L85
 * Reads newline-delimited JSON events from a `ReadableStream<Uint8Array>`.
 *
 * Yields one parsed {@link HandleMessageStreamEvent} per complete NDJSON line.
 * Handles partial lines across chunks via an internal buffer.
 *
 * All read errors — including socket disconnections — propagate to the caller.
 * Use {@link isStreamDisconnectError} to classify them.
 */
export async function* readNdjsonStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<HandleMessageStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reachedEof = false;

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        reachedEof = true;
        // Flush any remaining bytes in the decoder.
        buffer += decoder.decode();
        break;
      }

      if (result.value) {
        buffer += decoder.decode(result.value, { stream: true });
      }

      // Yield every complete line currently in the buffer.
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          yield JSON.parse(line) as HandleMessageStreamEvent;
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    // Yield any trailing content without a final newline.
    const trailing = buffer.trim();
    if (trailing.length > 0) {
      yield JSON.parse(trailing) as HandleMessageStreamEvent;
    }
  } finally {
    if (!reachedEof) {
      // Breaking an async iteration must close the response body; releasing
      // its lock alone leaves the server-side stream open.
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }
}
