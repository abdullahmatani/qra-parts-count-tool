/**
 * Polyfills for the JavaScript APIs that PDF.js calls but its legacy build
 * does not polyfill. Without them a browser a few releases behind fails to
 * open any PDF ("Promise.withResolvers is not a function") or to read its text.
 *
 * Loaded on the main thread (pdfjs.ts) and in the PDF.js worker (pdf.worker.ts),
 * before PDF.js itself. Each one is installed only when the browser lacks it.
 */

type WithResolvers = <T>() => {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

// Chrome/Edge 119, Firefox 121, Safari 17.4. Used throughout PDF.js.
const promiseCtor = Promise as PromiseConstructor & { withResolvers?: WithResolvers };
if (typeof promiseCtor.withResolvers !== 'function') {
  promiseCtor.withResolvers = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Chrome/Edge 124, Firefox 110, not in Safari. page.getTextContent() reads its
// text stream with `for await`.
const streamProto = ReadableStream.prototype as ReadableStream & {
  [Symbol.asyncIterator]?: unknown;
  values?: unknown;
};
if (typeof streamProto[Symbol.asyncIterator] !== 'function') {
  async function* values<R>(
    this: ReadableStream<R>,
    { preventCancel = false }: { preventCancel?: boolean } = {},
  ): AsyncGenerator<R, undefined> {
    const reader = this.getReader();
    let done = false;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) {
          done = true;
          return undefined;
        }
        yield result.value;
      }
    } finally {
      // Leaving the loop early (break, return or throw) cancels the stream.
      const cancelled = done || preventCancel ? undefined : reader.cancel();
      reader.releaseLock();
      await cancelled;
    }
  }
  streamProto[Symbol.asyncIterator] = values;
  streamProto.values ??= values;
}

// Chrome/Edge 114, Firefox 122, Safari 17.4. The worker uses it when a font is
// not embedded. A copy stands in for the transfer: PDF.js drops the original.
const bufferProto = ArrayBuffer.prototype as ArrayBuffer & {
  transferToFixedLength?: (newLength?: number) => ArrayBuffer;
};
if (typeof bufferProto.transferToFixedLength !== 'function') {
  bufferProto.transferToFixedLength = function (this: ArrayBuffer, newLength = this.byteLength) {
    const copy = new ArrayBuffer(newLength);
    new Uint8Array(copy).set(new Uint8Array(this, 0, Math.min(newLength, this.byteLength)));
    return copy;
  };
}
