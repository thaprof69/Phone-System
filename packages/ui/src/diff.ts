/**
 * Line diff used by agent version comparison, knowledge review and prompt history.
 *
 * A real longest-common-subsequence diff rather than a naive line-by-line comparison —
 * reviewers approving a production prompt change need to see genuine insertions and
 * deletions, not a whole file marked changed because one line was added at the top.
 */

export type DiffLineType = 'context' | 'added' | 'removed';

export type DiffLine = {
  type: DiffLineType;
  /** 1-indexed line number in the original text; null for additions. */
  beforeLine: number | null;
  /** 1-indexed line number in the updated text; null for removals. */
  afterLine: number | null;
  content: string;
};

export type DiffSummary = {
  added: number;
  removed: number;
  unchanged: number;
  changed: boolean;
};

function splitLines(value: string): string[] {
  // A trailing newline should not register as an extra empty line change.
  const normalised = value.replaceAll('\r\n', '\n').replace(/\n$/, '');
  return normalised === '' ? [] : normalised.split('\n');
}

/**
 * Standard dynamic-programming LCS table. Inputs here are prompts, configuration
 * documents and knowledge bodies — hundreds of lines, not megabytes — so the
 * quadratic table is acceptable and keeps the result exact.
 */
function longestCommonSubsequence(before: readonly string[], after: readonly string[]): number[][] {
  const table: number[][] = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const rowNext = table[i + 1];
    const row = table[i];
    if (!row || !rowNext) continue;
    for (let j = after.length - 1; j >= 0; j -= 1) {
      row[j] =
        before[i] === after[j]
          ? (rowNext[j + 1] ?? 0) + 1
          : Math.max(rowNext[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  return table;
}

export function diffLines(beforeText: string, afterText: string): DiffLine[] {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);
  const table = longestCommonSubsequence(before, after);

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({
        type: 'context',
        beforeLine: i + 1,
        afterLine: j + 1,
        content: before[i] ?? '',
      });
      i += 1;
      j += 1;
      continue;
    }
    const down = table[i + 1]?.[j] ?? 0;
    const right = table[i]?.[j + 1] ?? 0;
    if (down >= right) {
      lines.push({ type: 'removed', beforeLine: i + 1, afterLine: null, content: before[i] ?? '' });
      i += 1;
    } else {
      lines.push({ type: 'added', beforeLine: null, afterLine: j + 1, content: after[j] ?? '' });
      j += 1;
    }
  }
  while (i < before.length) {
    lines.push({ type: 'removed', beforeLine: i + 1, afterLine: null, content: before[i] ?? '' });
    i += 1;
  }
  while (j < after.length) {
    lines.push({ type: 'added', beforeLine: null, afterLine: j + 1, content: after[j] ?? '' });
    j += 1;
  }
  return lines;
}

export function summariseDiff(lines: readonly DiffLine[]): DiffSummary {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const line of lines) {
    if (line.type === 'added') added += 1;
    else if (line.type === 'removed') removed += 1;
    else unchanged += 1;
  }
  return { added, removed, unchanged, changed: added > 0 || removed > 0 };
}

/**
 * Collapses long runs of unchanged lines so a reviewer sees the changes, not the whole file.
 * Returns groups where `collapsed` runs can be rendered as a "N unchanged lines" marker.
 */
export function collapseContext(
  lines: readonly DiffLine[],
  contextLines = 3,
): Array<{ collapsed: true; count: number } | { collapsed: false; line: DiffLine }> {
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.type === 'context') return;
    for (let offset = -contextLines; offset <= contextLines; offset += 1) {
      const target = index + offset;
      if (target >= 0 && target < lines.length) keep.add(target);
    }
  });

  const output: Array<{ collapsed: true; count: number } | { collapsed: false; line: DiffLine }> =
    [];
  let run = 0;
  lines.forEach((line, index) => {
    if (keep.has(index)) {
      if (run > 0) {
        output.push({ collapsed: true, count: run });
        run = 0;
      }
      output.push({ collapsed: false, line });
    } else {
      run += 1;
    }
  });
  if (run > 0) output.push({ collapsed: true, count: run });
  return output;
}
