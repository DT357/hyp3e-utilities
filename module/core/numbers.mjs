export function readWholeCount(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (text === '') return 0;
  // hyp3e sheets store counts as text with comma or period thousands separators.
  // Invalid counts must not silently become zero before a document write.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,3}(?:\.\d{3})+)$/.test(text)) return null;
  const total = Number(text.replace(/[,.]/g, ''));
  return Number.isSafeInteger(total) ? total : null;
}
