import type { ReactNode } from 'react';
import { parseInline, type Block, type Inline } from '@/domain/help/markdown';
import { markRuns } from '@/domain/help/search';
import { cn } from '@/lib/utils';

export interface MarkdownProps {
  blocks: readonly Block[];
  /** Normalised words to mark as search matches. */
  marks?: ReadonlySet<string>;
  /** Follows a link inside the documentation (`counting.md#warnings`, `#warnings`). */
  onLink: (href: string) => void;
}

const NO_MARKS: ReadonlySet<string> = new Set();

/** Keys in code spans (`Ctrl+Z`, `Esc`, `F1`) are drawn as keys. */
const KEY = /^(Ctrl|Shift|Alt|Cmd|Esc|Enter|Delete|Backspace|Space|Tab|F\d{1,2})(\b|\+)/;

export function MarkedText({ text, marks }: { text: string; marks: ReadonlySet<string> }) {
  return (
    <>
      {markRuns(text, marks).map((run, i) =>
        run.mark ? (
          <mark
            key={i}
            data-testid="help-mark"
            className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-500/40"
          >
            {run.text}
          </mark>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

function renderInlines(
  inlines: readonly Inline[],
  marks: ReadonlySet<string>,
  onLink: MarkdownProps['onLink'],
): ReactNode[] {
  return inlines.map((node, i) => {
    switch (node.type) {
      case 'text':
        return <MarkedText key={i} text={node.text} marks={marks} />;
      case 'code':
        return KEY.test(node.text) ? (
          <kbd
            key={i}
            className="rounded border border-b-2 bg-muted px-1 py-px font-sans text-[0.8em] font-medium whitespace-nowrap"
          >
            {node.text}
          </kbd>
        ) : (
          <code key={i} className="rounded bg-muted px-1 py-px font-mono text-[0.85em]">
            <MarkedText text={node.text} marks={marks} />
          </code>
        );
      case 'strong':
        return (
          <strong key={i} className="font-semibold">
            {renderInlines(node.children, marks, onLink)}
          </strong>
        );
      case 'em':
        return <em key={i}>{renderInlines(node.children, marks, onLink)}</em>;
      case 'link': {
        const external = /^https?:\/\//i.test(node.href);
        return (
          <a
            key={i}
            href={node.href}
            className="font-medium text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-200"
            {...(external
              ? { target: '_blank', rel: 'noreferrer noopener' }
              : {
                  onClick: (event) => {
                    event.preventDefault();
                    onLink(node.href);
                  },
                })}
          >
            {renderInlines(node.children, marks, onLink)}
          </a>
        );
      }
    }
  });
}

const ALIGN = { left: 'text-start', center: 'text-center', right: 'text-end' } as const;

function renderBlocks(
  blocks: readonly Block[],
  marks: ReadonlySet<string>,
  onLink: MarkdownProps['onLink'],
  inList = false,
): ReactNode[] {
  return blocks.map((block, i) => {
    switch (block.type) {
      case 'heading': {
        const content = renderInlines(block.inlines, marks, onLink);
        if (block.level === 1) {
          return (
            <h1 key={i} data-anchor={block.id} className="mb-3 text-2xl font-semibold">
              {content}
            </h1>
          );
        }
        if (block.level === 2) {
          return (
            <h2
              key={i}
              data-anchor={block.id}
              className="mt-8 mb-3 scroll-mt-4 border-b pb-1 text-lg font-semibold"
            >
              {content}
            </h2>
          );
        }
        return (
          <h3
            key={i}
            data-anchor={block.id}
            className="mt-6 mb-2 scroll-mt-4 text-base font-semibold"
          >
            {content}
          </h3>
        );
      }
      case 'paragraph':
        return (
          <p key={i} className={inList ? 'my-1' : 'my-3 leading-relaxed'}>
            {renderInlines(block.inlines, marks, onLink)}
          </p>
        );
      case 'list': {
        const items = block.items.map((item, j) => (
          <li key={j} className="ps-1 leading-relaxed">
            {renderBlocks(item, marks, onLink, true)}
          </li>
        ));
        return block.ordered ? (
          <ol
            key={i}
            start={block.start}
            className={cn('list-decimal space-y-1.5 ps-6', inList ? 'my-1' : 'my-3')}
          >
            {items}
          </ol>
        ) : (
          <ul key={i} className={cn('list-disc space-y-1.5 ps-6', inList ? 'my-1' : 'my-3')}>
            {items}
          </ul>
        );
      }
      case 'table':
        return (
          <div key={i} className="my-4 overflow-x-auto rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {block.header.map((cell, c) => (
                    <th
                      key={c}
                      className={cn(
                        'border-b px-3 py-2 text-start font-medium',
                        ALIGN[block.align[c] ?? 'left'],
                      )}
                    >
                      {renderInlines(cell, marks, onLink)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="border-b last:border-b-0">
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className={cn('px-3 py-2 align-top', ALIGN[block.align[c] ?? 'left'])}
                      >
                        {renderInlines(cell, marks, onLink)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'code':
        return (
          <pre
            key={i}
            className="my-4 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
          >
            <code>{block.text}</code>
          </pre>
        );
      case 'quote':
        return (
          <blockquote key={i} className="my-3 border-s-4 ps-4 text-muted-foreground">
            {renderBlocks(block.children, marks, onLink)}
          </blockquote>
        );
      case 'rule':
        return <hr key={i} className="my-6" />;
    }
  });
}

/** Renders parsed documentation as React elements; no HTML in the text is interpreted. */
export function Markdown({ blocks, marks = NO_MARKS, onLink }: MarkdownProps) {
  return <div className="text-sm text-foreground">{renderBlocks(blocks, marks, onLink)}</div>;
}

const ignoreLink = () => {};

/** One line of inline Markdown (bold, code, keys), e.g. the text of a tour step. */
export function InlineMarkdown({ text }: { text: string }) {
  return <>{renderInlines(parseInline(text), NO_MARKS, ignoreLink)}</>;
}
