import { Filter, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UNASSIGNED_FILTER_KEY, filtersActive } from '@/domain/markup/presentation';
import { segmentAppearance } from '@/domain/palette';
import { useProjectStore } from '@/store/project-store';
import { useOrderedSegments } from '@/store/selectors';
import { useUiStore } from '@/store/ui-store';

function toggle(list: readonly string[], value: string, visible: boolean): string[] {
  return visible ? list.filter((v) => v !== value) : [...new Set([...list, value])];
}

const keepOpen = (event: Event) => event.preventDefault();

/** ANN-06: show or hide markers by segment, equipment type or unassigned status. */
export function MarkerFilterMenu() {
  const { t } = useTranslation();
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const segments = useOrderedSegments();
  const types = useProjectStore((s) => s.doc?.library.equipmentTypes);
  const active = filtersActive(filters);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={active ? 'secondary' : 'ghost'}
          aria-label={t('markup.filters.button')}
          title={t('markup.filters.button')}
          data-active={active ? 'true' : 'false'}
        >
          <Filter />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuLabel>{t('markup.filters.segments')}</DropdownMenuLabel>
        {segments.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {t('markup.filters.noSegments')}
          </p>
        )}
        {segments.map((segment) => (
          <DropdownMenuCheckboxItem
            key={segment.id}
            checked={!filters.hiddenSegments.includes(segment.id)}
            onSelect={keepOpen}
            onCheckedChange={(visible) =>
              setFilters({ hiddenSegments: toggle(filters.hiddenSegments, segment.id, visible) })
            }
          >
            <span
              aria-hidden="true"
              className="size-3 rounded-sm"
              style={{ background: segmentAppearance(segment.colour).cssVar }}
            />
            {segment.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuCheckboxItem
          checked={!filters.hiddenSegments.includes(UNASSIGNED_FILTER_KEY)}
          onSelect={keepOpen}
          onCheckedChange={(visible) =>
            setFilters({
              hiddenSegments: toggle(filters.hiddenSegments, UNASSIGNED_FILTER_KEY, visible),
            })
          }
        >
          {t('markup.filters.unassigned')}
        </DropdownMenuCheckboxItem>
        {types && types.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('markup.filters.types')}</DropdownMenuLabel>
            {types.map((type) => (
              <DropdownMenuCheckboxItem
                key={type.id}
                checked={!filters.hiddenTypes.includes(type.id)}
                onSelect={keepOpen}
                onCheckedChange={(visible) =>
                  setFilters({ hiddenTypes: toggle(filters.hiddenTypes, type.id, visible) })
                }
              >
                {type.name}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={filters.showUnassignedOnly}
          onSelect={keepOpen}
          onCheckedChange={(checked) => setFilters({ showUnassignedOnly: checked })}
        >
          {t('markup.filters.unassignedOnly')}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Status-bar chips for hidden segments and types, each with a one-click undo. */
export function MarkerFilterChips() {
  const { t } = useTranslation();
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const segments = useProjectStore((s) => s.doc?.segments);
  const types = useProjectStore((s) => s.doc?.library.equipmentTypes);

  const chips = [
    ...filters.hiddenSegments.map((id) => ({
      key: `s:${id}`,
      name: id === UNASSIGNED_FILTER_KEY ? t('markup.unassigned') : (segments?.[id]?.label ?? id),
      clear: () => setFilters({ hiddenSegments: filters.hiddenSegments.filter((v) => v !== id) }),
    })),
    ...filters.hiddenTypes.map((id) => ({
      key: `t:${id}`,
      name: types?.find((type) => type.id === id)?.name ?? id,
      clear: () => setFilters({ hiddenTypes: filters.hiddenTypes.filter((v) => v !== id) }),
    })),
  ];
  if (filters.showUnassignedOnly) {
    chips.push({
      key: 'unassignedOnly',
      name: t('markup.filters.unassignedOnly'),
      clear: () => setFilters({ showUnassignedOnly: false }),
    });
  }

  return (
    <>
      {chips.map((chip) => (
        <span
          key={chip.key}
          data-testid="filter-chip"
          className="flex h-5 items-center gap-1 rounded-full border bg-background ps-2 pe-0.5 text-[11px]"
        >
          {chip.key === 'unassignedOnly'
            ? chip.name
            : t('markup.filters.hidden', { name: chip.name })}
          <button
            type="button"
            onClick={chip.clear}
            aria-label={t('markup.filters.show', { name: chip.name })}
            className="rounded-full p-0.5 hover:bg-accent"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </>
  );
}
