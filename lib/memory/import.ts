import { MEMORY_CATEGORIES, MEMORY_CATEGORY_HEADERS } from "./constants";
import type { MemoryCategory } from "./types";

/**
 * Matches Markdown headings level 1-3 (#, ##, ###),
 * with an optional leading number (e.g. "## 2. Title"),
 * and captures the heading text in group 1.
 *
 * Example:
 *  # Introduction   -> Introduction
 *  ## 2. Results    -> Results
 *  ### 3.Conclusion -> Conclusion
 */
const HEADER_PATTERN = /^#{1,3}\s*\d*\.?\s*(.+?)\s*$/im;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function categoryFromHeader(header: string): MemoryCategory | undefined {
  const normalized = normalizeHeader(header);

  for (const category of MEMORY_CATEGORIES) {
    const aliases = MEMORY_CATEGORY_HEADERS[category];
    if (
      aliases.some(
        (alias) => normalized === alias || normalized.includes(alias)
      )
    ) {
      return category;
    }
  }
}

/*
 * Matches a fenced Markdown code block (```lang ... ```),
 * with an optional language tag after the opening fence,
 * and captures the code content in group 1.
 * Note: no "g" flag, so only the first code block is matched,
 * and no "m" flag, so the block must start at the beginning of the string.
 */
const CODE_BLOCK_PATTERN = /^```(?:\w+)?\s*\n([\s\S]*?)\n```/;

/**
 * Strips markdown code fence delimiters (```) from around a string, if present.
 * Handles an optional language tag after the opening backticks (e.g. ```ts, ```python).
 * If no code fence is detected, returns the original string (trimmed).
 *
 * Example:
 *   ```ts
 *   const x = 1;
 *   ```
 *   -> "const x = 1;"
 */
function stripCodeFence(raw: string) {
  const trimmed = raw.trim();
  const match = trimmed.match(CODE_BLOCK_PATTERN);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseMemoryImport(
  raw: string
): Partial<Record<MemoryCategory, string>> {
  const text = stripCodeFence(raw);
  const sections: Partial<Record<MemoryCategory, string>> = {};

  const lines = text.split("\n");
  let currentCategory: MemoryCategory | undefined;
  let buffer: string[] = [];

  function flush() {
    if (!currentCategory || buffer.length === 0) {
      return;
    }

    const content = buffer.join("\n").trim();
    if (content) {
      sections[currentCategory] = sections[currentCategory]
        ? `${sections[currentCategory]}\n\n${content}`
        : content;
    }
    buffer = [];
  }

  for (const line of lines) {
    const headerMatch = line.match(HEADER_PATTERN);
    if (headerMatch?.[1]) {
      const category = categoryFromHeader(headerMatch[1]);
      if (category) {
        flush();
        currentCategory = category;
        continue;
      }
    }

    if (currentCategory) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

export function normalizeMemoryContent(content: string) {
  return content.trim().replace(/\s+/g, " ");
}
