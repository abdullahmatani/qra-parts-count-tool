import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSpace, closeCadFile, openCadFile, type CadHandle } from './cad-client';

/** DWG reader workers run in-process: the real message handling over a stub parser. */
const readers = vi.hoisted(() => ({
  created: 0,
  terminated: 0,
  latest: null as { crash(): void } | null,
}));

vi.mock('./workers/dwg-reader', async () => {
  const { serveCadWorker } = await import('./workers/worker-core');
  const { emptyCadDocument } = await import('./model');
  class InProcessWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    private stopped = false;
    private readonly scope = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      postMessage: (message: unknown) => {
        if (!this.stopped) setTimeout(() => this.onmessage?.({ data: message } as MessageEvent));
      },
    };
    constructor() {
      readers.created += 1;
      readers.latest = this;
      serveCadWorker(this.scope, async (bytes) => {
        const doc = emptyCadDocument(new TextDecoder().decode(bytes));
        doc.modelSpace.push({
          layer: '0',
          color: { kind: 'byLayer' },
          type: 'line',
          start: [0, 0],
          end: [100, 50],
        });
        return doc;
      });
    }
    postMessage(message: unknown) {
      setTimeout(() => this.scope.onmessage?.({ data: message } as MessageEvent));
    }
    terminate() {
      this.stopped = true;
      readers.terminated += 1;
    }
    crash() {
      this.onerror?.({ message: 'trap', preventDefault() {} } as ErrorEvent);
    }
  }
  return {
    DWG_READER_NAME: 'test',
    createDwgWorker: () => new InProcessWorker() as unknown as Worker,
  };
});

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const open = (text: string) => openCadFile(bytes(text), 'dwg');

describe('CAD reader client (DRW-02)', () => {
  const handles: CadHandle[] = [];
  afterEach(async () => {
    for (const handle of handles.splice(0)) await closeCadFile(handle);
    readers.created = 0;
    readers.terminated = 0;
  });

  it('keeps the other files of a bulk import open when one is closed', async () => {
    const [a, b, c] = await Promise.all([open('a'), open('b'), open('c')]);
    handles.push(b!, c!);
    expect(readers.created).toBe(1);

    await buildSpace(a!, 'Model');
    await closeCadFile(a!);
    await expect(buildSpace(b!, 'Model')).resolves.toMatchObject({ space: 'Model' });
    await expect(buildSpace(c!, 'Model')).resolves.toMatchObject({ space: 'Model' });
    expect(readers.terminated).toBe(0);
  });

  it('frees the DWG reader once the last open file is closed', async () => {
    const a = await open('a');
    const b = await open('b');
    await closeCadFile(a);
    expect(readers.terminated).toBe(0);
    await closeCadFile(b);
    expect(readers.terminated).toBe(1);
    // The next file starts a fresh reader.
    handles.push(await open('c'));
    expect(readers.created).toBe(2);
  });

  it('never asks a restarted reader for a file that was open in the one before', async () => {
    const before = await open('before');
    readers.latest!.crash();
    // The new reader numbers its files from 1 again, like the one that crashed.
    const after = await open('after');
    handles.push(after);
    expect(after.docId).toBe(before.docId);
    await expect(buildSpace(before, 'Model')).rejects.toThrow('no longer open');
    await expect(buildSpace(after, 'Model')).resolves.toMatchObject({ space: 'Model' });
    await closeCadFile(before);
    expect(readers.terminated).toBe(1);
  });
});
