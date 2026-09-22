/**
 * What the reader asked, and where they were standing when they asked it.
 *
 * The only honest signal this tool has is whether its owner comes back for a
 * second book, which is true and useless — it arrives once, months late, and
 * says nothing about *which* station was bad. Questions are the cheap local
 * version of that signal: a station that gets asked about three times did not
 * make its one thing clear, and that is actionable the same evening.
 *
 * Deliberately not a transcript. The answers are not kept, because the point is
 * where attention piled up, not what was said — and a log of everything the
 * owner ever asked is a thing to be careful with even on one's own machine.
 */

export interface AskRecord {
  readonly at: string;
  readonly nodeId: string;
  readonly question: string;
  /** False when the book did not contain the answer — a stronger signal still. */
  readonly grounded: boolean;
}

/** Old questions stop being evidence about the current path. */
export const ASK_LOG_LIMIT = 500;

export function appendAsk(
  log: readonly AskRecord[],
  record: AskRecord,
  limit = ASK_LOG_LIMIT,
): readonly AskRecord[] {
  const next = [...log, record];
  return next.length > limit ? next.slice(next.length - limit) : next;
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

/** Stations worth re-reading yourself, hottest first. */
export function hottestStations(
  log: readonly AskRecord[],
  minHeat = 2,
): readonly { readonly nodeId: string; readonly heat: number }[] {
  return [...stationHeat(log)]
    .filter(([, heat]) => heat >= minHeat)
    .sort((a, b) => b[1] - a[1])
    .map(([nodeId, heat]) => ({ nodeId, heat }));
}
