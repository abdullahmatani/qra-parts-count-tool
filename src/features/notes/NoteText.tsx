import { Fragment } from 'react';
import { parseNote, type Inline } from '@/domain/notes/note-text';

function Runs({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((run, i) =>
        run.bold ? <strong key={i}>{run.text}</strong> : <Fragment key={i}>{run.text}</Fragment>,
      )}
    </>
  );
}

/** A note rendered from its formatting subset (NTE-01); text only, never HTML. */
export function NoteText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm break-words">
      {parseNote(text).map((block, i) =>
        block.kind === 'paragraph' ? (
          <p key={i}>
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Runs runs={line} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 ps-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Runs runs={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
