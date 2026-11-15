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
    snapshot: z.record(z.string(), z.unknown()).optional(),
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
/** Validates every page and always releases its device-bound temporary snapshot. */
export async function* recordPages(
  request: (path: string, body?: unknown) => Promise<any>,
  current: () => boolean = () => true,
  endpoint = '/exports',
) {
  let exportId: string | undefined,
    identity = '',
    records = 0,
    expected = 0,
    bytes = 0;
  const alive = () => {
    if (!current()) throw Error('Export cancelled');
  };
  try {
    alive();
    let raw = await request(endpoint, {});
    for (;;) {
      alive();
      const p = exportPageSchema.parse(raw);
      const signature = JSON.stringify([
        p.format,
        p.authorityId,
        p.exportId,
        p.createdAt,
        p.expiresAt,
        p.pages,
        p.records,
        p.snapshot,
      ]);
      if (expected === 0) {
        exportId = p.exportId;
        identity = signature;
      }
      if (
        p.index !== expected ||
        signature !== identity ||
        p.pages <= expected ||
        (p.next === null) !== (expected === p.pages - 1)
      )
        throw Error('Export page mismatch');
      bytes += new TextEncoder().encode(JSON.stringify(p.items)).byteLength;
      if (bytes > 64 * 1024 * 1024) throw Error('Export size limit');
      records += p.items.length;
      expected++;
      if (!p.next && records !== p.records) throw Error('Incomplete export');
      yield p;
      alive();
      if (!p.next) return;
      raw = await request(endpoint + '?cursor=' + encodeURIComponent(p.next));
    }
  } finally {
    if (exportId) await request('/exports/release', { exportId }).catch(() => {});
  }
}
/** Writes bounded JSONL chunks; completion is emitted only after every page validates. */
export async function writeRecordExport(
  request: (path: string, body?: unknown) => Promise<any>,
  write: (text: string) => Promise<void>,
  current: () => boolean = () => true,
) {
  let records = 0,
    pages = 0,
    exportId = '';
  for await (const p of recordPages(request, current)) {
    if (p.snapshot) throw Error('Export scope mismatch');
    if (p.index === 0) {
      exportId = p.exportId;
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
    if (!current()) throw Error('Export cancelled');
    await write(p.items.map((x) => JSON.stringify(x) + '\n').join(''));
    records += p.items.length;
    pages++;
  }
  if (!current()) throw Error('Export cancelled');
  await write(JSON.stringify({ complete: true, records, pages }) + '\n');
  return { exportId, records, pages };
}
