// Node version of the folder adapter in js/store.js, for tests and tools/compare.mjs.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

export function nodeMapp(p) {
  return {
    name: basename(p),
    async entries() {
      return (await readdir(p, { withFileTypes: true })).map(e => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' }));
    },
    async file(n) {
      try {
        const f = join(p, n);
        if (!(await stat(f)).isFile()) return null;
        return { name: n, lastModified: (await stat(f)).mtimeMs, text: () => readFile(f, 'utf8'), arrayBuffer: async () => { const b = await readFile(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
      } catch { return null; }
    },
    async dir(n) {
      try { return (await stat(join(p, n))).isDirectory() ? nodeMapp(join(p, n)) : null; } catch { return null; }
    }
  };
}
