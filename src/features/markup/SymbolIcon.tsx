import { Circle, Lasso, Square } from 'lucide-react';
import type { MarkerSymbol } from '@/domain/schema/types';

/** The icon for a marker shape, in the equipment bar and the marker panel. */
export function SymbolIcon({ symbol }: { symbol: MarkerSymbol }) {
  switch (symbol) {
    case 'dot':
      return <Circle className="size-2.5 fill-current" />;
    case 'circle':
      return <Circle />;
    case 'square':
      return <Square />;
    case 'freeform':
      return <Lasso />;
  }
}
