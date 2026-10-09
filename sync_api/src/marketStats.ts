import type {Collection} from 'mongodb';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const VISIT_KEEP_MS = 8 * 24 * 60 * 60 * 1000;
export const HIGHLIGHT_TTL_MS = 12 * 60 * 60 * 1000;
export const SUGGESTION_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

type VisitDoc = {marketId: string; userId: string; seenAt: string};
type HighlightDoc = {marketId: string; featured: boolean; until: string};

export class MarketStats {
  private readonly visits: Record<string, VisitDoc> = {};
  private readonly highlights: Record<string, HighlightDoc> = {};
  private backfilled = false;

  constructor(
    private readonly mode: 'memory' | 'mongo',
    private readonly col: (name: string) => Collection,
  ) {}

  async recordVisit(
    marketId: string | null | undefined,
    userId: string | null | undefined,
    at: string | null | undefined,
  ): Promise<void> {
    if (!marketId || !userId) return;
    const seenAt = at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString();
    if (Date.now() - Date.parse(seenAt) > VISIT_KEEP_MS) return;
    const doc: VisitDoc = {marketId, userId, seenAt};
    if (this.mode === 'memory') {
      const prev = this.visits[this.key(marketId, userId)];
      if (!prev || prev.seenAt < seenAt) {
        this.visits[this.key(marketId, userId)] = doc;
      }
      return;
    }
    const current = await this.col('market_visits').findOne({marketId, userId});
    if (current && String(current.seenAt) >= seenAt) return;
    await this.col('market_visits').updateOne(
      {marketId, userId},
      {$set: doc},
      {upsert: true},
    );
  }

  async weeklyCounts(): Promise<Map<string, number>> {
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    const rows =
      this.mode === 'memory'
        ? Object.values(this.visits).filter(row => row.seenAt >= since)
        : ((await this.col('market_visits')
            .find({seenAt: {$gte: since}})
            .toArray()) as unknown as VisitDoc[]);
    const sets = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = sets.get(row.marketId) ?? new Set<string>();
      set.add(row.userId);
      sets.set(row.marketId, set);
    }
    const counts = new Map<string, number>();
    for (const [id, set] of sets) counts.set(id, set.size);
    return counts;
  }

  async highlightFor(marketId: string): Promise<boolean | null> {
    const now = new Date().toISOString();
    const row =
      this.mode === 'memory'
        ? this.highlights[marketId]
        : ((await this.col('market_highlights').findOne({
            marketId,
          })) as HighlightDoc | null);
    if (!row || row.until <= now) return null;
    return row.featured;
  }

  async saveHighlight(marketId: string, featured: boolean): Promise<void> {
    const doc: HighlightDoc = {
      marketId,
      featured,
      until: new Date(Date.now() + HIGHLIGHT_TTL_MS).toISOString(),
    };
    if (this.mode === 'memory') {
      this.highlights[marketId] = doc;
      return;
    }
    await this.col('market_highlights').updateOne(
      {marketId},
      {$set: doc},
      {upsert: true},
    );
  }

  /** Preenche visitas dos últimos 7 dias uma vez, se a coleção ainda está vazia. */
  async backfillFromLogs(
    loadLogs: () => Promise<Array<Record<string, unknown>>>,
  ): Promise<void> {
    if (this.backfilled) return;
    this.backfilled = true;
    const since = new Date(Date.now() - WEEK_MS).toISOString();
    if (this.mode === 'mongo') {
      const existing = await this.col('market_visits').findOne({});
      if (existing) return;
    } else if (Object.keys(this.visits).length > 0) {
      return;
    }
    const logs = await loadLogs();
    for (const log of logs) {
      const at = String(log.capturedAt ?? log.updatedAt ?? '');
      if (!at || at < since) continue;
      await this.recordVisit(
        log.marketId != null ? String(log.marketId) : null,
        log.contributorId != null ? String(log.contributorId) : null,
        at,
      );
    }
  }

  async purge(): Promise<void> {
    const visitCut = new Date(Date.now() - VISIT_KEEP_MS).toISOString();
    const now = new Date().toISOString();
    if (this.mode === 'memory') {
      for (const [key, row] of Object.entries(this.visits)) {
        if (row.seenAt < visitCut) delete this.visits[key];
      }
      for (const [key, row] of Object.entries(this.highlights)) {
        if (row.until <= now) delete this.highlights[key];
      }
      return;
    }
    await this.col('market_visits').deleteMany({seenAt: {$lt: visitCut}});
    await this.col('market_highlights').deleteMany({until: {$lte: now}});
  }

  private key(marketId: string, userId: string) {
    return `${marketId}|${userId}`;
  }
}
