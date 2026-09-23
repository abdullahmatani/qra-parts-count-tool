import { ReviewBanner } from '@/features/drawings/ReviewBanner';
import { SearchHitsLayer } from '@/features/search/SearchHitsLayer';
import { DrawingViewer } from '@/features/viewer/DrawingViewer';
import { useMarkupTools } from './useMarkupTools';

/** The drawing viewer with the markup overlay and tools (ANN-01..07). */
export function MarkupViewer({ drawingId }: { drawingId: string }) {
  const tools = useMarkupTools(drawingId);
  return (
    <>
      <DrawingViewer
        drawingId={drawingId}
        overlay={(context) => (
          <>
            <SearchHitsLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
            {tools.overlay(context)}
          </>
        )}
        screenOverlay={tools.screenOverlay}
        interaction={tools.interaction}
      />
      <ReviewBanner drawingId={drawingId} />
    </>
  );
}
