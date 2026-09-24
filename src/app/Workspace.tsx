import { useState, type DragEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDefaultLayout } from 'react-resizable-panels';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { DrawingList } from '@/features/drawings/DrawingList';
import { SegmentList } from '@/features/segments/SegmentList';
import { CanvasArea, type CanvasAreaProps } from './CanvasArea';
import { Header } from './Header';
import { RightPane, type RightPaneProps } from './RightPane';
import { StatusBar, type StatusBarProps } from './StatusBar';

export interface WorkspaceProps {
  onCloseProject?: () => void;
  onImportDrawings?: () => void;
  /** Files dropped anywhere on the workspace (drawing import). */
  onDropFiles?: (files: File[]) => void;
  onAddSegment?: () => void;
  renderDrawing?: CanvasAreaProps['renderDrawing'];
  rightPane?: RightPaneProps;
  statusBar?: StatusBarProps;
  children?: ReactNode;
}

/**
 * Three-pane workspace (FDS section 6): drawings and segments on the left, the
 * canvas in the centre, and the active segment's panels on the right. Pane
 * sizes are remembered in the browser. A right-to-left interface (NFR-08)
 * mirrors the panes.
 */
export function Workspace({
  onCloseProject,
  onImportDrawings,
  onDropFiles,
  onAddSegment,
  renderDrawing,
  rightPane,
  statusBar,
  children,
}: WorkspaceProps) {
  const { t, i18n } = useTranslation();
  const dir = i18n.dir();
  const layout = useDefaultLayout({ id: 'qrapc.workspace', storage: localStorage });
  const [dragging, setDragging] = useState(false);
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

  return (
    <div
      className="relative flex h-full flex-col"
      data-testid="workspace"
      onDragOver={(event) => {
        if (!onDropFiles || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!onDropFiles || !hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        onDropFiles([...event.dataTransfer.files]);
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-4 border-dashed border-sky-500 bg-sky-500/10 text-lg font-medium">
          {t('import.dropHint')}
        </div>
      )}
      <Header onCloseProject={onCloseProject} />
      {/*
        The panel group resizes in screen direction only, so it stays left to
        right and a right-to-left interface lists the panes in reverse.
      */}
      <ResizablePanelGroup
        dir="ltr"
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        {inOrder(dir, [
          <ResizablePanel
            key="left"
            id="left"
            dir={dir}
            defaultSize="18%"
            minSize={200}
            maxSize="35%"
          >
            <nav className="flex h-full flex-col divide-y bg-panel" data-testid="left-pane">
              <DrawingList onImport={onImportDrawings} />
              <SegmentList onAdd={onAddSegment} />
            </nav>
          </ResizablePanel>,
          <ResizablePanel key="centre" id="centre" dir={dir} minSize="30%">
            <CanvasArea renderDrawing={renderDrawing} />
          </ResizablePanel>,
          <ResizablePanel
            key="right"
            id="right"
            dir={dir}
            defaultSize="24%"
            minSize={280}
            maxSize="40%"
          >
            <RightPane {...rightPane} />
          </ResizablePanel>,
        ])}
      </ResizablePanelGroup>
      <StatusBar {...statusBar} />
      {children}
    </div>
  );
}

/** The three panes with resize handles between them, mirrored for right to left. */
function inOrder(dir: string, [start, centre, end]: [ReactNode, ReactNode, ReactNode]) {
  const [first, last] = dir === 'rtl' ? [end, start] : [start, end];
  return (
    <>
      {first}
      <ResizableHandle />
      {centre}
      <ResizableHandle />
      {last}
    </>
  );
}
