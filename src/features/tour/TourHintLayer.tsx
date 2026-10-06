import { useProjectStore } from '@/store/project-store';
import { useTourStore } from './tour-store';
import { TOUR_STEPS, sheetId } from './tour-steps';

/** The guided tour's pointers on the sheet: dashed rings round what the step is about. */
export function TourHintLayer({
  drawingId,
  unitsPerPixel: upp,
}: {
  drawingId: string;
  unitsPerPixel: number;
}) {
  const spots = useTourStore((s) => (s.active ? TOUR_STEPS[s.step]?.spots : undefined));
  const onSheet = useProjectStore((s) =>
    s.doc && spots ? sheetId(s.doc, spots.sheet) === drawingId : false,
  );
  if (!spots || !onSheet) return null;
  const stroke = {
    fill: 'none',
    stroke: '#0ea5e9',
    strokeWidth: 3 * upp,
    strokeDasharray: `${8 * upp} ${5 * upp}`,
  };
  return (
    <g data-testid="tour-hints" pointerEvents="none" className="animate-pulse">
      {spots.at.map((spot, i) =>
        'r' in spot ? (
          <circle key={i} cx={spot.x} cy={spot.y} r={spot.r} {...stroke} />
        ) : (
          <rect
            key={i}
            x={spot.x}
            y={spot.y}
            width={spot.width}
            height={spot.height}
            rx={4}
            {...stroke}
          />
        ),
      )}
    </g>
  );
}
