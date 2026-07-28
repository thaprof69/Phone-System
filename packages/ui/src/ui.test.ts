import { describe, expect, it } from 'vitest';
import {
  CATEGORICAL_BARS,
  CATEGORICAL_SERIES,
  MAX_SERIES,
  categoryColor,
  seriesColor,
} from './chart-theme';
import { collapseContext, diffLines, summariseDiff } from './diff';
import {
  formatCurrencyFromMicros,
  formatDuration,
  formatLatency,
  formatPercent,
  humaniseState,
  ratio,
  shortId,
} from './format';
import { compareBySeverity, toneForState } from './status';

describe('diffLines', () => {
  it('reports no change for identical text', () => {
    const lines = diffLines('alpha\nbravo', 'alpha\nbravo');
    expect(summariseDiff(lines).changed).toBe(false);
  });

  it('detects a single inserted line without marking the rest changed', () => {
    const lines = diffLines('alpha\ncharlie', 'alpha\nbravo\ncharlie');
    const summary = summariseDiff(lines);
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(0);
    expect(summary.unchanged).toBe(2);
  });

  it('detects a deletion', () => {
    const summary = summariseDiff(diffLines('alpha\nbravo\ncharlie', 'alpha\ncharlie'));
    expect(summary.removed).toBe(1);
    expect(summary.added).toBe(0);
  });

  it('treats a replaced line as one removal and one addition', () => {
    const summary = summariseDiff(diffLines('policy: strict', 'policy: relaxed'));
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(1);
  });

  it('ignores a trailing newline difference', () => {
    expect(summariseDiff(diffLines('alpha\n', 'alpha')).changed).toBe(false);
  });

  it('handles an empty original', () => {
    const summary = summariseDiff(diffLines('', 'first line'));
    expect(summary.added).toBe(1);
    expect(summary.removed).toBe(0);
  });

  it('numbers lines against the correct side', () => {
    const lines = diffLines('a\nc', 'a\nb\nc');
    const added = lines.find((line) => line.type === 'added');
    expect(added?.beforeLine).toBeNull();
    expect(added?.afterLine).toBe(2);
  });
});

describe('collapseContext', () => {
  it('collapses long unchanged runs but keeps surrounding context', () => {
    const before = Array.from({ length: 40 }, (_, index) => `line ${index}`).join('\n');
    const after = before.replace('line 20', 'line 20 changed');
    const groups = collapseContext(diffLines(before, after), 2);
    const collapsed = groups.filter((group) => group.collapsed);
    expect(collapsed.length).toBeGreaterThan(0);
    // The changed line and its context survive rather than being folded away.
    const kept = groups.filter((group) => !group.collapsed);
    expect(kept.some((group) => !group.collapsed && group.line.content.includes('changed'))).toBe(
      true,
    );
  });

  it('collapses nothing when everything changed', () => {
    const groups = collapseContext(diffLines('a', 'b'), 3);
    expect(groups.every((group) => !group.collapsed)).toBe(true);
  });
});

describe('formatCurrencyFromMicros', () => {
  it('renders whole pounds in GBP', () => {
    expect(formatCurrencyFromMicros(2_500_000)).toBe('£2.50');
  });

  it('keeps four decimals for sub-penny model spend', () => {
    expect(formatCurrencyFromMicros(1_200)).toBe('£0.0012');
  });

  it('returns an em dash for absent values rather than zero', () => {
    // Showing £0.00 for "unknown" would imply a measured spend of nothing.
    expect(formatCurrencyFromMicros(null)).toBe('—');
    expect(formatCurrencyFromMicros(undefined)).toBe('—');
  });

  it('honours a non-default currency', () => {
    expect(formatCurrencyFromMicros(1_000_000, 'USD')).toContain('1.00');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(252)).toBe('4m 12s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(7_500)).toBe('2h 5m');
  });

  it('returns an em dash for unknown durations', () => {
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatLatency', () => {
  it('uses milliseconds below a second', () => {
    expect(formatLatency(420)).toBe('420 ms');
  });

  it('switches to seconds above a second', () => {
    expect(formatLatency(1_480)).toBe('1.48 s');
  });
});

describe('ratio and formatPercent', () => {
  it('computes a ratio', () => {
    expect(ratio(3, 4)).toBe(0.75);
  });

  it('returns null rather than zero when there is no denominator', () => {
    // A rate with no evidence must not render as 0%.
    expect(ratio(0, 0)).toBeNull();
  });

  it('formats a percentage', () => {
    expect(formatPercent(0.756)).toBe('75.6%');
  });

  it('renders an em dash for null', () => {
    expect(formatPercent(null)).toBe('—');
  });
});

describe('humaniseState', () => {
  it('turns a machine state into a sentence', () => {
    expect(humaniseState('APPROVED_FOR_PUBLISH')).toBe('Approved for publish');
  });

  it('handles absent state', () => {
    expect(humaniseState(null)).toBe('—');
  });
});

describe('shortId', () => {
  it('truncates long identifiers', () => {
    expect(shortId('4a56f57e-3528-4aa2-8adb-02af71d824b5')).toBe('4a56f57e…');
  });

  it('leaves short identifiers intact', () => {
    expect(shortId('abc')).toBe('abc');
  });
});

describe('toneForState', () => {
  it('maps success states to good', () => {
    expect(toneForState('PUBLISHED')).toBe('good');
    expect(toneForState('IN_SYNC')).toBe('good');
  });

  it('maps in-flight states to warning', () => {
    expect(toneForState('DRAFT')).toBe('warning');
    expect(toneForState('DRIFTED')).toBe('warning');
  });

  it('maps failure states to danger', () => {
    expect(toneForState('TEST_FAILED')).toBe('danger');
    expect(toneForState('EXTERNALLY_BLOCKED')).toBe('danger');
  });

  it('is case and separator insensitive', () => {
    expect(toneForState('test passed')).toBe('good');
  });

  it('falls back to neutral for unknown states rather than guessing', () => {
    expect(toneForState('SOME_NEW_STATE')).toBe('neutral');
    expect(toneForState(null)).toBe('neutral');
  });
});

describe('compareBySeverity', () => {
  it('sorts danger before warning before good', () => {
    const sorted = (['good', 'danger', 'warning'] as const).slice().sort(compareBySeverity);
    expect(sorted).toEqual(['danger', 'warning', 'good']);
  });
});

describe('chart palette', () => {
  it('exposes exactly the validated categorical order', () => {
    expect(CATEGORICAL_SERIES).toEqual([
      '#e2701a',
      '#1c6d99',
      '#d13f3f',
      '#7a4ac4',
      '#0f8a63',
      '#b1860c',
    ]);
  });

  it('clamps rather than cycling past the last slot', () => {
    // Cycling would paint series 7 the same colour as series 1 and read as one entity.
    expect(seriesColor(MAX_SERIES + 3)).toBe(CATEGORICAL_SERIES[MAX_SERIES - 1]);
  });

  it('clamps negative indexes to the first slot', () => {
    expect(seriesColor(-2)).toBe(CATEGORICAL_SERIES[0]);
  });

  it('keeps long categorical bar runs visually distinct', () => {
    const colours = Array.from({ length: CATEGORICAL_BARS.length }, (_, index) =>
      categoryColor(index),
    );
    expect(new Set(colours).size).toBe(CATEGORICAL_BARS.length);
    expect(categoryColor(CATEGORICAL_BARS.length)).not.toBe(
      categoryColor(CATEGORICAL_BARS.length - 1),
    );
  });
});
