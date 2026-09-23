import { useMemo } from 'react';
import {
  countEntries,
  markerWarningMap,
  type CountDoc,
  type CountEntry,
  type MarkerWarning,
} from '@/domain/count/count';
import { useProjectStore } from '@/store/project-store';

/** The parts of the project the count depends on, as stable references. */
function useCountDoc(): CountDoc | null {
  const markers = useProjectStore((s) => s.doc?.markers);
  const items = useProjectStore((s) => s.doc?.items);
  const segments = useProjectStore((s) => s.doc?.segments);
  const library = useProjectStore((s) => s.doc?.library);
  const settings = useProjectStore((s) => s.doc?.settings);
  const acceptedDuplicates = useProjectStore((s) => s.doc?.acceptedDuplicates);
  return useMemo(
    () =>
      markers && items && segments && library && settings && acceptedDuplicates
        ? { markers, items, segments, library, settings, acceptedDuplicates }
        : null,
    [markers, items, segments, library, settings, acceptedDuplicates],
  );
}

const NO_ENTRIES: CountEntry[] = [];

/** Every count entry in the project, recomputed only when counting inputs change. */
export function useCountEntries(): CountEntry[] {
  const doc = useCountDoc();
  return useMemo(() => (doc ? countEntries(doc) : NO_ENTRIES), [doc]);
}

const NO_WARNINGS = new Map<string, MarkerWarning[]>();

/** Warnings per marker: unassigned, incomplete item, duplicate tag. */
export function useMarkerWarnings(): Map<string, MarkerWarning[]> {
  const doc = useCountDoc();
  const entries = useCountEntries();
  return useMemo(() => (doc ? markerWarningMap(doc, entries) : NO_WARNINGS), [doc, entries]);
}
