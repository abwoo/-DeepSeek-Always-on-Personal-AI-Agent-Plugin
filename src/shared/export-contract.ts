import { z } from 'zod';
export const exportItemSchema = z
  .object({
    kind: z.enum(['tasks', 'runs', 'memory', 'inbox', 'goals']),
    id: z.string().min(1),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export type ExportItem = z.infer<typeof exportItemSchema>;
export const exportPageSchema = z
  .object({
    format: z.literal('always-on.records/v1'),
    authorityId: z.uuid(),
    exportId: z.uuid(),
    createdAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    index: z.number().int().min(0).max(9999),
    pages: z.number().int().min(1).max(10000),
    records: z.number().int().min(0),
    items: z.array(exportItemSchema).max(100),
    next: z
      .string()
      .regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}\.\d{1,4}$/)
      .nullable(),
  })
  .strict();
export type ExportPage = z.infer<typeof exportPageSchema>;
/** Writes bounded JSONL chunks; the completion footer is emitted only after every page validates. */
export async function writeRecordExport(
  request: (path: string, body?: unknown) => Promise<any>,
  write: (text: string) => Promise<void>,
  current: () => boolean = () => true,
) {
  let exportId: string | undefined,
    identity = '',
    records = 0,
    pages = 0,
    expected = 0;
  const alive = () => {
    if (!current()) throw Error('Export cancelled');
  };
  try {
    alive();
    let raw = await request('/exports', {});
    for (;;) {
      alive();
      const p = exportPageSchema.parse(raw);
      if (expected === 0) {
        exportId = p.exportId;
        identity = JSON.stringify([
          p.format,
          p.authorityId,
          p.exportId,
          p.createdAt,
          p.expiresAt,
          p.pages,
          p.records,
        ]);
        await write(
          JSON.stringify({
            format: p.format,
            authorityId: p.authorityId,
            exportId: p.exportId,
            createdAt: p.createdAt,
            scope:
              'Personal agent records, including proposed memory. Native Session transcripts and credentials are excluded.',
          }) + '\n',
        );
      }
      if (
        p.index !== expected ||
        identity !==
          JSON.stringify([
            p.format,
            p.authorityId,
            p.exportId,
            p.createdAt,
            p.expiresAt,
            p.pages,
            p.records,
          ]) ||
        p.pages <= expected ||
        (p.next === null) !== (expected === p.pages - 1)
      )
        throw Error('Export page mismatch');
      alive();
      await write(p.items.map((x) => JSON.stringify(x) + '\n').join(''));
      records += p.items.length;
      pages++;
      expected++;
      if (!p.next) {
        if (records !== p.records) throw Error('Incomplete export');
        alive();
        await write(JSON.stringify({ complete: true, records, pages }) + '\n');
        return { exportId: p.exportId, records, pages };
      }
      raw = await request('/exports?cursor=' + encodeURIComponent(p.next));
    }
  } finally {
    if (exportId) await request('/exports/release', { exportId }).catch(() => {});
  }
}
