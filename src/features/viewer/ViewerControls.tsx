import {
  Expand,
  Map as MapIcon,
  MoveHorizontal,
  RotateCcw,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';

export interface ViewerControlsProps {
  zoom: number;
  minimap: boolean;
  onZoomIn(): void;
  onZoomOut(): void;
  onActualSize(): void;
  onFitPage(): void;
  onFitWidth(): void;
  onRotate(delta: 90 | -90): void;
  onToggleMinimap(): void;
}

/** Floating pan/zoom/rotate controls for the drawing canvas (DRW-05). */
export function ViewerControls(props: ViewerControlsProps) {
  const { t } = useTranslation();
  const button = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <Button size="icon-sm" variant="ghost" aria-label={label} title={label} onClick={onClick}>
      {icon}
    </Button>
  );
  return (
    <div
      className="absolute start-3 bottom-3 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-md"
      data-testid="viewer-controls"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {button(t('viewer.zoomOut'), props.onZoomOut, <ZoomOut />)}
      <Button
        size="sm"
        variant="ghost"
        className="w-16 font-mono text-xs tabular-nums"
        title={t('viewer.actualSize')}
        onClick={props.onActualSize}
        data-testid="viewer-zoom"
      >
        {Math.round(props.zoom * 100)}%
      </Button>
      {button(t('viewer.zoomIn'), props.onZoomIn, <ZoomIn />)}
      <Separator orientation="vertical" className="mx-0.5 h-5!" />
      {button(t('viewer.fitPage'), props.onFitPage, <Expand />)}
      {button(t('viewer.fitWidth'), props.onFitWidth, <MoveHorizontal />)}
      <Separator orientation="vertical" className="mx-0.5 h-5!" />
      {button(t('viewer.rotateLeft'), () => props.onRotate(-90), <RotateCcw />)}
      {button(t('viewer.rotateRight'), () => props.onRotate(90), <RotateCw />)}
      <Separator orientation="vertical" className="mx-0.5 h-5!" />
      <Toggle
        size="sm"
        pressed={props.minimap}
        onPressedChange={props.onToggleMinimap}
        aria-label={t('viewer.minimap')}
        title={t('viewer.minimap')}
      >
        <MapIcon />
      </Toggle>
    </div>
  );
}
