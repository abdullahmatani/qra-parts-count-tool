/// <reference lib="webworker" />
/** DXF reader worker: the app's own parser (DRW-10). */
import { parseDxf } from '../dxf/parse-dxf';
import { serveCadWorker } from './worker-core';

function decode(bytes: ArrayBuffer): string {
  // DXF from AutoCAD 2007+ is UTF-8; older files use a code page. UTF-8 decoding
  // keeps ASCII (tags, drawing numbers) intact either way.
  return new TextDecoder('utf-8').decode(bytes);
}

serveCadWorker(self as unknown as Parameters<typeof serveCadWorker>[0], async (bytes) =>
  parseDxf(decode(bytes)),
);
