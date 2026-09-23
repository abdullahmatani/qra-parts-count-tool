import { DrawingViewer } from '@/features/viewer/DrawingViewer';
import { useMarkupTools } from './useMarkupTools';

/** The drawing viewer with the markup overlay and tools (ANN-01..07). */
export function MarkupViewer({ drawingId }: { drawingId: string }) {
  const tools = useMarkupTools(drawingId);
  return (
    <DrawingViewer
      drawingId={drawingId}
      overlay={tools.overlay}
      screenOverlay={tools.screenOverlay}
      interaction={tools.interaction}
    />
  );
}
