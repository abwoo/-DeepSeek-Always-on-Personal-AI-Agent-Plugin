import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ManagedClient } from '@abwoo/always-on-client';
/** Export bytes go to a private temporary file, never a giant share-sheet message. */
export async function shareRecords(client: ManagedClient, current: () => boolean) {
  if (!(await Sharing.isAvailableAsync()))
    throw Error('File sharing is not available on this device.');
  const dir = new Directory(Paths.cache, 'always-on-exports');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  const file = new File(dir, 'personal-agent-records.jsonl');
  file.create();
  const handle = file.open();
  let closed = false;
  try {
    await client.exportRecords(async (text) => {
      await handle.writeBytes(new TextEncoder().encode(text));
    }, current);
    handle.close();
    closed = true;
    if (!current()) throw Error('Export cancelled');
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/x-ndjson',
      UTI: 'public.plain-text',
      dialogTitle: 'Export personal agent records',
    });
  } finally {
    if (!closed) handle.close();
    if (dir.exists) dir.delete();
  }
}
