import { SuggestionLayer } from '@/features/assist/SuggestionLayer';
import { LayerMenu } from '@/features/cad/LayerMenu';
import { ReviewBanner } from '@/features/drawings/ReviewBanner';
import { SearchHitsLayer } from '@/features/search/SearchHitsLayer';
import { TourHintLayer } from '@/features/tour/TourHintLayer';
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
            <SuggestionLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
            {tools.overlay(context)}
            <TourHintLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
          </>
        )}
        screenOverlay={tools.screenOverlay}
        interaction={tools.interaction}
      />
      <LayerMenu drawingId={drawingId} />
      <ReviewBanner drawingId={drawingId} />
    </>
  );
}
