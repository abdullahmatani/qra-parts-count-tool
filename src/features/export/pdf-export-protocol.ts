/**
 * Messages and shared types between the app and the PDF export worker. Kept
 * free of pdf-lib, so importing it does not pull pdf-lib into the main bundle.
 */
import type { OutlineEntry, Overlay } from '@/domain/export/pdf-plan';
import type { DisplayList } from '@/features/cad/display-list';
import type { CadColorMode } from '@/store/preferences';

export type { OutlineEntry };

export type PageSource =
  | { kind: 'pdf'; key: string; pageIndex: number }
  | { kind: 'cad'; list: DisplayList; mode: CadColorMode };

export interface BuildPage {
  source: PageSource;
  overlay: Overlay;
}

/** What is written in the PDF's document information. */
export interface PdfMeta {
  title: string;
  /** ISO time, written as the PDF's creation date. */
  createdAt: string;
}

export interface BuildJob extends PdfMeta {
  pages: BuildPage[];
  /** Bookmarks to pages of the PDF. */
  outline?: OutlineEntry[];
}

export type SourceProblem = 'encrypted' | 'unreadable' | 'missingPage';

/** A source PDF that cannot be used; `problem` picks the message shown to the user. */
export class PdfSourceError extends Error {
  readonly problem: SourceProblem;
  constructor(problem: SourceProblem, message: string) {
    super(message);
    this.name = 'PdfSourceError';
    this.problem = problem;
  }
}

/**
 * A PDF is written a page at a time (`start`, `append` for each page,
 * `finish`), so a long one never needs all of its drawings in memory at once.
 */
export type PdfWorkerRequest =
  | { id: number; op: 'sources'; sources: { key: string; bytes: ArrayBuffer }[] }
  | { id: number; op: 'start'; meta: PdfMeta }
  | { id: number; op: 'append'; page: BuildPage }
  | { id: number; op: 'finish'; outline: OutlineEntry[] }
  | { id: number; op: 'clear' };

export type PdfWorkerResponse =
  | { id: number; ok: true; kind: 'done' }
  | { id: number; ok: true; kind: 'missing'; keys: string[] }
  | { id: number; ok: true; kind: 'pdf'; bytes: Uint8Array }
  | { id: number; ok: false; problem: SourceProblem | null; error: string };
