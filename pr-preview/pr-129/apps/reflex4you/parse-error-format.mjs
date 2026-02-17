export function formatCaretIndicator(source, failure) {
  const displaySource = source && source.length ? source : '(empty)';
  const origin = failure?.span?.input?.start ?? 0;
  const pointer = failure?.span ? failure.span.start - origin : 0;
  const clamped = Number.isFinite(pointer)
    ? Math.max(0, Math.min(pointer, displaySource.length))
    : 0;
  const message = failure?.message || 'Parse error';

  // Display only the line containing the error (instead of dumping the whole formula).
  const before = displaySource.slice(0, clamped);
  const lineStart = before.lastIndexOf('\n') + 1; // -1 -> 0
  const after = displaySource.slice(clamped);
  const newlineAhead = after.indexOf('\n');
  const lineEnd = newlineAhead === -1 ? displaySource.length : clamped + newlineAhead;
  const line = displaySource.slice(lineStart, lineEnd);
  const col = clamped - lineStart;
  const caretLine = `${' '.repeat(Math.max(0, col))}^`;

  return `${line}\n${caretLine}\n${message}`;
}
