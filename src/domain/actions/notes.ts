/** Segment notes (NTE-01, NTE-02, NTE-04): timestamped entries with author initials. */
import { newId } from '@/lib/ids';
import type { ProjectDoc } from '../model';
import type { Note } from '../schema/types';

export function addNote(
  doc: Pick<ProjectDoc, 'notes' | 'segments' | 'markers'>,
  input: { segmentId: string; text: string; author: string; markerRef?: string | null },
  now: Date,
): string | null {
  if (!doc.segments[input.segmentId] || !input.text.trim()) return null;
  const note: Note = {
    id: newId('not'),
    segmentId: input.segmentId,
    author: input.author.trim().slice(0, 20),
    timestamp: now.toISOString(),
    text: input.text.trim(),
    markerRef: input.markerRef && doc.markers[input.markerRef] ? input.markerRef : null,
  };
  doc.notes[note.id] = note;
  return note.id;
}

/** Edits a note's text or marker reference; the timestamp and author stay as written. */
export function updateNote(
  doc: Pick<ProjectDoc, 'notes' | 'markers'>,
  noteId: string,
  patch: { text?: string; markerRef?: string | null },
): void {
  const note = doc.notes[noteId];
  if (!note) return;
  if (patch.text !== undefined && patch.text.trim() && note.text !== patch.text.trim()) {
    note.text = patch.text.trim();
  }
  if (patch.markerRef !== undefined) {
    note.markerRef = patch.markerRef && doc.markers[patch.markerRef] ? patch.markerRef : null;
  }
}

export function deleteNote(doc: Pick<ProjectDoc, 'notes'>, noteId: string): void {
  delete doc.notes[noteId];
}

/** A segment's notes, oldest first. */
export function segmentNotes(doc: Pick<ProjectDoc, 'notes'>, segmentId: string): Note[] {
  return Object.values(doc.notes)
    .filter((note) => note.segmentId === segmentId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
