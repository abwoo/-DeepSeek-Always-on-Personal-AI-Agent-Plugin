import { randomUUID } from 'node:crypto';
import { memorySchema } from '../shared/schemas.js';
import type { Store } from './storage.js';
export interface Memory {
  id: string;
  kind: string;
  content: string;
  source: string;
  updatedAt: string;
  consent: boolean;
  version?: number;
}
export class MemoryService {
  constructor(private store: Store) {}
  save(input: unknown) {
    const data = memorySchema.parse(input);
    const id = data.id ?? randomUUID();
    const prior = this.store.get<Memory>('memory', id);
    if (!prior && this.list().length >= 500) throw new Error('Memory limit (500) reached');
    if (
      data.expectedVersion !== undefined &&
      (!prior || data.expectedVersion !== (prior.version ?? 0))
    )
      throw new Error('Memory changed on another device; reload and review before saving.');
    const { expectedVersion: _, ...value } = data;
    const entry = {
      ...value,
      id,
      version: (prior?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.store.put('memory', id, entry);
    return entry;
  }
  propose(input: unknown) {
    const data = memorySchema.omit({ consent: true, id: true, expectedVersion: true }).parse(input);
    if (this.list().length >= 500) throw new Error('Memory limit (500) reached');
    const id = randomUUID();
    const entry = { ...data, id, consent: false, updatedAt: new Date().toISOString() };
    this.store.put('memory', id, entry);
    return entry;
  }
  list() {
    return this.store.all<Memory>('memory');
  }
  remove(id: string) {
    return this.store.delete('memory', id) > 0;
  }
  search(query: string, limit = 5) {
    // Word segmentation supports Chinese/Japanese queries without a domain
    // dictionary or vector runtime. Bound and deduplicate query terms.
    const normalized = query.normalize('NFKC').toLowerCase().slice(0, 12000);
    const terms = [
      ...new Set(
        [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(normalized)]
          .filter((part) => part.isWordLike)
          .map((part) => part.segment),
      ),
    ].slice(0, 64);
    return this.list()
      .filter((m) => m.consent)
      .map((m) => {
        const content = m.content.normalize('NFKC').toLowerCase();
        return { m, score: terms.reduce((a, t) => a + (content.includes(t) ? 1 : 0), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(5, Math.max(0, limit)))
      .map((x) => x.m);
  }
}
