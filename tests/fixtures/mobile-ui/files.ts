// In-memory file/share adapter. Actual native modules are built/tested separately.
const files = new Map<string, Uint8Array[]>();
export const Paths = { cache: 'fixture-cache' };
export class Directory {
  uri: string;
  exists = false;
  constructor(...parts: any[]) {
    this.uri = parts.map((x) => x.uri ?? x).join('/');
  }
  create() {
    this.exists = true;
  }
  delete() {
    for (const k of files.keys()) if (k.startsWith(this.uri + '/')) files.delete(k);
    this.exists = false;
  }
}
export class File {
  uri: string;
  constructor(...parts: any[]) {
    this.uri = parts.map((x) => x.uri ?? x).join('/');
  }
  create() {
    files.set(this.uri, []);
  }
  open() {
    const uri = this.uri;
    let closed = false;
    return {
      writeBytes: async (value: Uint8Array) => {
        if (closed) throw Error('Closed native handle');
        files.get(uri)!.push(value);
      },
      close: () => {
        if (closed) throw Error('Handle closed twice');
        closed = true;
      },
    };
  }
}
export const isAvailableAsync = async () => true;
export async function shareAsync(uri: string) {
  (window as any).__exportText = files
    .get(uri)!
    .map((x) => new TextDecoder().decode(x))
    .join('');
}
