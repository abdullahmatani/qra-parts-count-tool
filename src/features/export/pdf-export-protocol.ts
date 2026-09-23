/**
 * Messages and shared types between the app and the PDF export worker. Kept
 * free of pdf-lib, so importing it does not pull pdf-lib into the main bundle.
 */
import type { Overlay } from '@/domain/export/pdf-plan';
import type { DisplayList } from '@/features/cad/display-list';
import type { CadColorMode } from '@/store/preferences';

export type PageSource =
  | { kind: 'pdf'; key: string; pageIndex: number }
  | { kind: 'cad'; list: DisplayList; mode: CadColorMode };

export interface BuildPage {
  source: PageSource;
  overlay: Overlay;
}

export interface BuildJob {
  title: string;
  /** ISO time, written as the PDF's creation date. */
  createdAt: string;
  pages: BuildPage[];
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

export type PdfWorkerRequest =
  | { id: number; op: 'sources'; sources: { key: string; bytes: ArrayBuffer }[] }
  | { id: number; op: 'build'; job: BuildJob }
  | { id: number; op: 'clear' };

export type PdfWorkerResponse =
  | { id: number; ok: true; kind: 'done' }
  | { id: number; ok: true; kind: 'missing'; keys: string[] }
  | { id: number; ok: true; kind: 'pdf'; bytes: Uint8Array }
  | { id: number; ok: false; problem: SourceProblem | null; error: string };
