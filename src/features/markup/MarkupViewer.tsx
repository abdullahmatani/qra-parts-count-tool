import { SuggestionLayer } from '@/features/assist/SuggestionLayer';
import { LayerMenu } from '@/features/cad/LayerMenu';
import { ReviewBanner } from '@/features/drawings/ReviewBanner';
import { HistoryGhostLayer } from '@/features/history/HistoryGhostLayer';
import { SearchHitsLayer } from '@/features/search/SearchHitsLayer';
import { TourHintLayer } from '@/features/tour/TourHintLayer';
import { DrawingViewer } from '@/features/viewer/DrawingViewer';
import { CanvasContextMenu } from './CanvasContextMenu';
import { useMarkupTools } from './useMarkupTools';

/** The drawing viewer with the markup overlay, tools and right-click menu (ANN-01..07). */
export function MarkupViewer({ drawingId }: { drawingId: string }) {
  const tools = useMarkupTools(drawingId);
  return (
    <>
      <CanvasContextMenu drawingId={drawingId} menu={tools.contextMenu}>
        <div
          className="contents"
          // The menu is for the drawing: a right-click on the zoom buttons or minimap opens nothing.
          onContextMenu={(event) => {
            if (!(event.target as Element).closest('[role="application"]')) event.preventDefault();
          }}
        >
          <DrawingViewer
            drawingId={drawingId}
            overlay={(context) => (
              <>
                <SearchHitsLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
                <SuggestionLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
                {tools.overlay(context)}
                <HistoryGhostLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
                <TourHintLayer drawingId={drawingId} unitsPerPixel={context.unitsPerPixel} />
              </>
            )}
            screenOverlay={tools.screenOverlay}
            interaction={tools.interaction}
          />
        </div>
      </CanvasContextMenu>
      <LayerMenu drawingId={drawingId} />
      <ReviewBanner drawingId={drawingId} />
    </>
  );
}
