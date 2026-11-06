/**
 * react-query `placeholderData` for a record page's query, keyed `[kind, id, ...]`:
 * while it switches between rounds of the same record (e.g. "Back to now"), the
 * record on screen stays up until the new one is in, so the page doesn't drop to
 * a loading tile and close any open dialog. Another record starts from nothing.
 */
export function keepSameRecord(id: unknown) {
  return <T,>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery?.queryKey[1] === id ? previous : undefined;
}
