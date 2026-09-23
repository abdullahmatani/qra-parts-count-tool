import { Bold, Link2, List, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { addNote, deleteNote, segmentNotes, updateNote } from '@/domain/actions/notes';
import { markerLabel } from '@/domain/markup/presentation';
import { applyFormat } from '@/domain/notes/note-text';
import type { Note } from '@/domain/schema/types';
import { showMarker } from '@/features/segments/segment-commands';
import { usePreferences } from '@/store/preferences';
import { useProjectStore } from '@/store/project-store';
import { useActiveSegment } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';
import { NoteText } from './NoteText';

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** A textarea with Bold and Bullet buttons that insert the note formatting (NTE-01). */
function NoteEditor({
  value,
  onChange,
  onSubmit,
  autoFocus,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  autoFocus?: boolean;
  label: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  const format = (kind: 'bold' | 'bullet') => {
    const el = ref.current;
    if (!el) return;
    const next = applyFormat(value, el.selectionStart, el.selectionEnd, kind);
    onChange(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('notes.bold')}
          title={t('notes.bold')}
          onClick={() => format('bold')}
        >
          <Bold />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t('notes.bullets')}
          title={t('notes.bullets')}
          onClick={() => format('bullet')}
        >
          <List />
        </Button>
        {children}
      </div>
      <Textarea
        ref={ref}
        aria-label={label}
        value={value}
        placeholder={t('notes.placeholder')}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        autoFocus={autoFocus}
        rows={3}
        className="min-h-16 text-sm"
      />
    </div>
  );
}

function markerName(markerId: string | null): string | null {
  if (!markerId) return null;
  const doc = useProjectStore.getState().doc;
  const marker = doc?.markers[markerId];
  if (!marker) return null;
  const item = Object.values(doc!.items).find((i) => i.markerId === markerId);
  return markerLabel(marker, item) || markerId;
}

function NoteEntry({ note, readOnly }: { note: Note; readOnly: boolean }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const markers = useProjectStore((s) => s.doc?.markers);
  const referenced = note.markerRef && markers?.[note.markerRef] ? note.markerRef : null;

  const save = () => {
    useProjectStore
      .getState()
      .apply(t('notes.history.edit'), (d) => updateNote(d, note.id, { text: draft }));
    setEditing(false);
  };

  return (
    <li className="group space-y-1 rounded-md border bg-background p-2" data-testid="note">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 font-medium text-foreground">
          {note.author || t('notes.anonymous')}
        </span>
        <time dateTime={note.timestamp}>{timeFormat.format(new Date(note.timestamp))}</time>
        {!readOnly && !editing && (
          <span className="ms-auto flex opacity-60 group-hover:opacity-100">
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={t('notes.edit')}
              onClick={() => {
                setDraft(note.text);
                setEditing(true);
              }}
            >
              <Pencil />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={t('notes.delete')}
              onClick={() =>
                useProjectStore
                  .getState()
                  .apply(t('notes.history.delete'), (d) => deleteNote(d, note.id))
              }
            >
              <Trash2 />
            </Button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <NoteEditor
            value={draft}
            onChange={setDraft}
            onSubmit={save}
            autoFocus
            label={t('notes.edit')}
          />
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('notes.cancel')}
            </Button>
            <Button size="sm" onClick={save} disabled={!draft.trim()}>
              {t('notes.save')}
            </Button>
          </div>
        </div>
      ) : (
        <NoteText text={note.text} />
      )}
      {note.markerRef && (
        <button
          type="button"
          disabled={!referenced}
          onClick={() => referenced && showMarker(referenced)}
          className="flex items-center gap-1 text-xs text-[var(--link-overlay)] hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          <Link2 className="size-3" />
          {t('notes.refersTo', {
            marker: referenced ? markerName(referenced) : t('notes.missingMarker'),
          })}
        </button>
      )}
    </li>
  );
}

/**
 * The active segment's notes (NTE-01, NTE-02, NTE-04): timestamped entries
 * signed with the user's initials, with bold and bullets, and an optional
 * reference to a marker.
 */
export function NotesPanel() {
  const { t } = useTranslation();
  const segment = useActiveSegment();
  const notesRecord = useProjectStore((s) => s.doc?.notes);
  const readOnly = useProjectStore((s) => s.readOnly);
  const initials = usePreferences((s) => s.initials);
  const selection = useUiStore((s) => s.selection);
  const [text, setText] = useState('');
  const [refer, setRefer] = useState(false);
  const notes = useMemo(
    () => (segment && notesRecord ? segmentNotes({ notes: notesRecord }, segment.id) : []),
    [segment, notesRecord],
  );
  if (!segment) return null;
  const selected = selection.length === 1 ? selection[0]! : null;

  const submit = () => {
    if (!text.trim()) return;
    const done = useProjectStore.getState().apply(t('notes.history.add'), (d) => {
      addNote(
        d,
        {
          segmentId: segment.id,
          text,
          author: initials,
          markerRef: refer ? selected : null,
        },
        new Date(),
      );
    });
    if (done) {
      setText('');
      setRefer(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="notes-panel">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('notes.empty')}</p>
      ) : (
        <ul className="space-y-1.5">
          {notes.map((note) => (
            <NoteEntry key={note.id} note={note} readOnly={readOnly} />
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="space-y-1">
          <NoteEditor value={text} onChange={setText} onSubmit={submit} label={t('notes.add')}>
            <Toggle
              size="sm"
              pressed={refer && !!selected}
              onPressedChange={setRefer}
              disabled={!selected}
              aria-label={t('notes.reference')}
              title={t('notes.reference')}
              className="h-7 gap-1 px-2 text-xs"
            >
              <Link2 /> {t('notes.referenceShort')}
            </Toggle>
          </NoteEditor>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              {initials ? t('notes.addHint') : t('notes.noInitials')}
            </p>
            <Button size="sm" onClick={submit} disabled={!text.trim()}>
              {t('notes.add')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
