/**
 * Duplicate ids in an id-keyed configuration list (M6-P3 fix round 1,
 * CR-M6P3A-01).
 *
 * THE MECHANISM THIS CLOSES: a list keyed by id and read by FIRST MATCH lets a
 * duplicate silently shadow the entry after it. Measured on assurance modes: a
 * second `full` row placed first with `merge-authority: owner` made both merge
 * checks report "no decorrelation is required" and exit 0. Every reader of
 * such a list refuses a duplicate through this one function instead of
 * choosing a row, so no reader can disagree with another about which row wins.
 */

/** One id that occurs more than once, and every position it occurs at. */
export interface DuplicateId {
  id: string;
  indexes: number[];
}

/**
 * Every id that occurs more than once in `rows`, in order of first
 * occurrence. `idOf` returns undefined for a row with no usable id; such a row
 * is skipped here, because a missing id is the schema's or the caller's refusal
 * to make, not a duplicate.
 */
export function duplicateIds<T>(
  rows: readonly T[],
  idOf: (row: T) => string | undefined,
): DuplicateId[] {
  const positions = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const id = idOf(row);
    if (id === undefined) {
      return;
    }
    const seen = positions.get(id);
    if (seen === undefined) {
      positions.set(id, [index]);
    } else {
      seen.push(index);
    }
  });
  return [...positions]
    .filter(([, indexes]) => indexes.length > 1)
    .map(([id, indexes]) => ({ id, indexes }));
}

/** One sentence per duplicate, naming the document, the id and every position. */
export function describeDuplicateIds(
  document: string,
  what: string,
  duplicates: readonly DuplicateId[],
): string {
  return duplicates
    .map(
      (duplicate) =>
        `${document} declares ${what} ${duplicate.id} ${String(duplicate.indexes.length)} times ` +
        `(entries ${duplicate.indexes.join(", ")}), so a reader taking the first would shadow the rest`,
    )
    .join("; ");
}
