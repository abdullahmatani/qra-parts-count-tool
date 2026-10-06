// @vitest-environment node
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type * as PdfjsModule from 'pdfjs-dist';
import { afterAll, describe, expect, it, vi } from 'vitest';

type Pdfjs = typeof PdfjsModule;
type Loose = Record<PropertyKey, unknown>;
// The app's TypeScript lib predates these APIs.
type WithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};
type Transfer = (newLength?: number) => ArrayBuffer;

// A browser that lacks the APIs: remove Node's own before the polyfills load.
const natives = vi.hoisted(() => {
  const list = [
    [Promise, 'withResolvers'],
    [ReadableStream.prototype, Symbol.asyncIterator],
    [ArrayBuffer.prototype, 'transferToFixedLength'],
  ] as const;
  const saved = list.map(([target, key]) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)!;
    delete (target as unknown as Loose)[key];
    return [target, key, descriptor] as const;
  });
  return saved;
});

await import('./polyfills');

afterAll(() => {
  for (const [target, key, descriptor] of natives) Object.defineProperty(target, key, descriptor);
});

function withResolvers<T>() {
  return (Promise as unknown as { withResolvers: WithResolvers }).withResolvers<T>();
}

function transfer(buffer: ArrayBuffer, newLength?: number) {
  return new Uint8Array(
    (buffer as unknown as { transferToFixedLength: Transfer }).transferToFixedLength(newLength),
  );
}

function streamOf(chunks: string[], onCancel = () => {}) {
  return new ReadableStream<string>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel: onCancel,
  }) as ReadableStream<string> & AsyncIterable<string>;
}

describe('PDF.js polyfills', () => {
  it('replaces the missing APIs', () => {
    for (const [target, key, descriptor] of natives) {
      const installed = (target as unknown as Loose)[key];
      expect(typeof installed).toBe('function');
      expect(installed).not.toBe(descriptor.value);
    }
  });

  it('Promise.withResolvers settles the promise from outside', async () => {
    const ok = withResolvers<number>();
    ok.resolve(42);
    await expect(ok.promise).resolves.toBe(42);
    const failed = withResolvers<number>();
    failed.reject(new Error('nope'));
    await expect(failed.promise).rejects.toThrow('nope');
  });

  it('a ReadableStream can be read with for await', async () => {
    const read: string[] = [];
    for await (const chunk of streamOf(['a', 'b', 'c'])) read.push(chunk);
    expect(read).toEqual(['a', 'b', 'c']);
  });

  it('leaving the loop early cancels the stream and releases it', async () => {
    const onCancel = vi.fn();
    const stream = streamOf(['a', 'b', 'c'], onCancel);
    for await (const chunk of stream) {
      expect(chunk).toBe('a');
      break;
    }
    expect(onCancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('ArrayBuffer.transferToFixedLength copies to the new length', () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    expect([...transfer(buffer, 2)]).toEqual([1, 2]);
    expect([...transfer(buffer, 6)]).toEqual([1, 2, 3, 4, 0, 0]);
    expect([...transfer(buffer)]).toEqual([1, 2, 3, 4]);
  });

  it('PDF.js opens a PDF and reads its text', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([842, 595]).drawText('PEFS-1001', { x: 100, y: 500, size: 12, font });
    // In Node the PDF.js worker runs on the main thread, so both halves use the polyfills.
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as Pdfjs;
    const task = pdfjs.getDocument({ data: await doc.save(), disableFontFace: true, verbosity: 0 });
    const pdf = await task.promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    expect(content.items.map((item) => ('str' in item ? item.str : ''))).toContain('PEFS-1001');
    await task.destroy();
  });
});
