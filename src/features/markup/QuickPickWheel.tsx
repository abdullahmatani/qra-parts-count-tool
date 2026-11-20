/**
 * The quick-pick wheel (count stage): a marking menu of the equipment types
 * met most often, opened round the pointer by pressing and holding the left
 * button with the equipment marker tool. Pointing into a wedge and letting go
 * places a marker counted as that type where the button was pressed.
 *
 * The wheel only draws; the canvas keeps the pointer, so it never takes events.
 */
import { useTranslation } from 'react-i18next';
import { wheelAngle, type EquipmentChoice } from '@/domain/equipment-choices';
import type { XY } from '@/domain/markup/geometry';
import { choiceName } from '@/features/count/choice-name';
import { cn } from '@/lib/utils';

/** Radius (CSS px) of the dead zone in the middle: let go there and nothing is picked. */
export const WHEEL_DEAD_ZONE = 22;
/** Outer radius of the ring of wedges. */
const RING = 70;
/** Where the type names are anchored, just outside the ring. */
const LABEL = RING + 10;
/** Half the gap left between neighbouring wedges, in radians. */
const GAP = 0.03;

/** An annular sector from angle `a0` to `a1` (radians, screen axes) round the origin. */
function sector(a0: number, a1: number, inner: number, outer: number): string {
  const point = (r: number, a: number) => `${r * Math.cos(a)} ${r * Math.sin(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${point(outer, a0)}`,
    `A ${outer} ${outer} 0 ${large} 1 ${point(outer, a1)}`,
    `L ${point(inner, a1)}`,
    `A ${inner} ${inner} 0 ${large} 0 ${point(inner, a0)}`,
    'Z',
  ].join(' ');
}

export interface QuickPickWheelProps {
  /** The middle of the wheel, in CSS px within the canvas: where the marker goes. */
  centre: XY;
  choices: readonly EquipmentChoice[];
  /** The wedge pointed at, if any. */
  active: number | null;
  /** Let go without a pick: the wheel stays open until a click. */
  sticky: boolean;
}

export function QuickPickWheel({ centre, choices, active, sticky }: QuickPickWheelProps) {
  const { t } = useTranslation();
  const count = choices.length;
  const half = Math.PI / count;
  const size = RING * 2 + 4;
  return (
    <>
      <div
        role="status"
        className="pointer-events-none absolute top-2 left-1/2 z-20 max-w-[90%] -translate-x-1/2 truncate rounded-md bg-foreground/85 px-3 py-1 text-xs text-background shadow"
      >
        {t(sticky ? 'quickPick.stickyHint' : 'quickPick.hint')}
      </div>
      <div
        data-testid="quick-pick-wheel"
        data-sticky={sticky ? 'true' : 'false'}
        role="menu"
        aria-label={t('quickPick.label')}
        className="pointer-events-none absolute z-20 size-0"
        style={{ left: centre.x, top: centre.y }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
          className="absolute overflow-visible drop-shadow-md"
          style={{ left: -size / 2, top: -size / 2 }}
          aria-hidden="true"
        >
          {choices.map((choice, i) => {
            const mid = wheelAngle(i, count);
            return (
              <path
                key={choice.key}
                d={sector(mid - half + GAP, mid + half - GAP, WHEEL_DEAD_ZONE + 3, RING)}
                className={cn(
                  'stroke-border transition-colors duration-75',
                  i === active ? 'fill-primary' : 'fill-popover/90',
                )}
              />
            );
          })}
          <circle r={WHEEL_DEAD_ZONE} className="fill-popover/70 stroke-border" />
          {/* Where the marker goes. */}
          <circle r={3} className="fill-primary" />
        </svg>
        {choices.map((choice, i) => {
          const angle = wheelAngle(i, count);
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const name = choiceName(choice, t);
          return (
            <div
              key={choice.key}
              role="menuitem"
              data-testid="quick-pick-choice"
              data-type-id={choice.type.id}
              data-actuation={choice.actuation ?? ''}
              data-active={i === active ? 'true' : 'false'}
              aria-current={i === active ? 'true' : undefined}
              title={name}
              className={cn(
                'absolute max-w-44 truncate rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap shadow-sm transition-colors duration-75',
                i === active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-popover text-popover-foreground',
              )}
              style={{
                left: cos * LABEL,
                top: sin * LABEL,
                // Names lean away from the middle: those on the left end at their anchor.
                transform: `translate(${-50 + cos * 50}%, ${-50 + sin * 50}%)`,
              }}
            >
              {name}
            </div>
          );
        })}
      </div>
    </>
  );
}
