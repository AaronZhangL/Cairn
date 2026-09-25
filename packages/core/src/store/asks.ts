/**
 * Where the reader's questions piled up, per station. A station asked about
 * three times did not make its one thing clear — actionable the same evening.
 * Computed from the companion's messages; nothing here is stored.
 */

export interface AskRecord {
  readonly at: string;
  readonly nodeId: string;
  readonly question: string;
  /** False when the book did not contain the answer — a stronger signal still. */
  readonly grounded: boolean;
}

/**
 * How many questions each station drew.
 *
 * An ungrounded question counts double: the reader asked something the station
 * pointed at and the book could not answer, which is the worst case — either
 * the station raised a question it does not settle, or it sent them to the
 * wrong chapters.
 */
export function stationHeat(log: readonly AskRecord[]): ReadonlyMap<string, number> {
  const heat = new Map<string, number>();
  for (const record of log) {
    heat.set(record.nodeId, (heat.get(record.nodeId) ?? 0) + (record.grounded ? 1 : 2));
  }
  return heat;
}
