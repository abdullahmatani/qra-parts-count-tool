/**
 * Project file schema, version 1 (FDS section 5).
 *
 * The Zod schemas in this file are the single source of truth for the shape of
 * `project.qrapc.json`. TypeScript types are inferred from them, and the JSON
 * Schema in `docs/schema/` is generated from them (`pnpm schema`).
 *
 * Conventions:
 * - Every entity has a string `id` that is unique within the project.
 * - Geometry is in drawing coordinates: origin at the top-left of the drawing
 *   as normally displayed, x to the right, y down, in drawing units (PDF
 *   points for PDF drawings). See ANN-02.
 * - Derived data (size bins, totals) is never stored (FDS section 5, rules).
 * - Optional text fields default to '' and optional values to null, so files
 *   written by hand or by older builds still parse.
 */
import { z } from 'zod';

export const SCHEMA_VERSION_1 = 1 as const;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const Id = z.string().min(1).max(64);
export const Timestamp = z.iso.datetime({ offset: true });
const Coordinate = z.number().finite();
const PositiveNumber = z.number().finite().positive();
const Text = z.string().max(20_000).default('');
const ShortText = z.string().max(500).default('');

export const Point = z.tuple([Coordinate, Coordinate]);

export const Rect = z.object({
  x: Coordinate,
  y: Coordinate,
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** SEG-08: where an ESDV on a segment boundary is counted. No default exists. */
export const EsdvBoundaryRule = z.enum(['upstream', 'downstream', 'both', 'neither']);

/** CNT-09: whether flange items are reported per flanged joint or per flange face. */
export const FlangeConvention = z.enum(['perJoint', 'perFace']);

/** CNT-01: nominal size unit. Sizes in DN are converted to inches for binning. */
export const SizeUnit = z.enum(['in', 'DN']);

/** CNT-03: valve actuation class. Automated covers actuated, control and ESD valves. */
export const Actuation = z.enum(['manual', 'automated']);

/** SEG-09: segment progress status. */
export const SegmentStatus = z.enum(['notStarted', 'inProgress', 'counted', 'checked']);

/**
 * Where the study stands: segments and their extent are defined first, then
 * the parts are counted. The interface shows the tools and panels of the stage.
 */
export const ProjectStage = z.enum(['segments', 'count']);

export const DrawingFileType = z.enum(['pdf', 'dwg', 'dxf']);

/**
 * ANN-01: circles (equipment and ESDVs) and dashed highlights, plus
 * highlighter strokes painted over a segment's pipework and equipment, ESDVs
 * drawn as a double line across the pipe (SEG-01), and end flanges: a bar
 * across the pipe where a segment ends at a closed drain, the flare or another
 * end point that is not an ESDV.
 */
export const MarkerShape = z.enum([
  'circle',
  'dashedHighlight',
  'highlighter',
  'doubleLine',
  'endFlange',
]);

/** Where the pipe goes beyond an end flange. */
export const EndFlangeDestination = z.enum(['closedDrain', 'flare', 'other']);

/**
 * How an equipment (circle) marker is drawn: a ring, a filled dot, a square or
 * a free-form outline. Its geometry is always the symbol's bounding circle, so
 * the symbol never changes what is counted.
 */
export const MarkerSymbol = z.enum(['circle', 'dot', 'square', 'freeform']);

/** Broad equipment categories. Categories drive behaviour (e.g. flange convention, pipe length). */
export const EquipmentCategory = z.enum([
  'valve',
  'flange',
  'smallBore',
  'pump',
  'compressor',
  'vessel',
  'heatExchanger',
  'filter',
  'pigTrap',
  'instrument',
  'pipe',
  'other',
]);

/** Section 7: supported Excel template layout modes. */
export const LayoutMode = z.enum([
  'sheetPerSegment',
  'rowPerSegment',
  'blockPerSegment',
  'flatItemList',
]);

// ---------------------------------------------------------------------------
// Project settings
// ---------------------------------------------------------------------------

export const Units = z.object({
  /** Default unit offered when entering a nominal size. */
  size: SizeUnit.default('in'),
  /** Label for operating pressure values, e.g. "barg". */
  pressure: z.string().max(20).default('barg'),
  /** Label for operating temperature values, e.g. "°C". */
  temperature: z.string().max(20).default('°C'),
  /** Pipe lengths are always metres (CNT-12). */
  length: z.literal('m').default('m'),
});

export const ProjectSettings = z
  .object({
    /** SEG-08: chosen by the user at project setup. Required: there is no default. */
    esdvBoundaryRule: EsdvBoundaryRule,
    /** CNT-09 */
    flangeConvention: FlangeConvention,
    /** CNT-12 */
    pipeLengthCounting: z.boolean().default(false),
    units: Units.prefault({}),
    /** EXP-05: pattern for annotated PDF names. */
    exportFilenamePattern: z.string().max(200).default('{drawingNo}_{rev}_annotated'),
  })
  .meta({
    id: 'ProjectSettings',
    description: 'Project-level counting rules chosen at setup (SEG-08, CNT-09, CNT-12, EXP-05).',
  });

// ---------------------------------------------------------------------------
// Drawings (DRW)
// ---------------------------------------------------------------------------

export const Size2D = z.object({
  width: PositiveNumber,
  height: PositiveNumber,
});

export const Drawing = z
  .object({
    id: Id,
    /** File name inside `drawings/`. */
    fileName: z.string().min(1).max(255),
    /** Name of the file the user imported, before any de-duplication. */
    originalFileName: z.string().max(255).default(''),
    /** SHA-256 of the file in hex; detects renamed or changed files (FDS section 5). */
    fileHash: z.string().regex(/^[0-9a-f]{64}$/),
    fileType: DrawingFileType,
    /** 1-based page number for PDF drawings (DRW-01), otherwise null. */
    page: z.number().int().positive().nullable().default(null),
    /** Layout name for DWG/DXF drawings ("Model" for model space), otherwise null. */
    layout: z.string().max(255).nullable().default(null),
    /** DRW-10: true when the PDF is a plot of a DWG drawing. */
    isCadPlot: z.boolean().default(false),
    drawingNo: ShortText,
    sheet: ShortText,
    title: ShortText,
    revision: ShortText,
    /** Size of the drawing in drawing units at 0° rotation. */
    size: Size2D,
    importedAt: Timestamp,
    /** DRW-07: set when a revision replacement changed the page size. */
    needsReview: z.boolean().default(false),
  })
  .meta({
    id: 'Drawing',
    description: 'One drawing: a PDF page or a DWG/DXF layout copied into drawings/ (DRW-01..04).',
  });

// ---------------------------------------------------------------------------
// Segments (SEG)
// ---------------------------------------------------------------------------

export const Segment = z
  .object({
    id: Id,
    /** Unique text label, e.g. "IS-01" (SEG-02). */
    label: z.string().min(1).max(100),
    description: Text,
    /** 1-based index into the segment palette (`--segment-1` … `--segment-12`); cycles with a pattern after 12. */
    colour: z.number().int().positive(),
    fluid: ShortText,
    phase: ShortText,
    /** Operating pressure in `settings.units.pressure`. */
    pressure: z.number().finite().nullable().default(null),
    /** Operating temperature in `settings.units.temperature`. */
    temperature: z.number().finite().nullable().default(null),
    /** Main equipment item or object of the segment, e.g. "V-100 inlet separator". */
    equipment: ShortText,
    /** Heat and mass balance stream number. */
    streamNumber: ShortText,
    /** H2S concentration as a mole fraction (0–1). */
    h2sMoleFraction: z.number().finite().min(0).max(1).nullable().default(null),
    /** Molecular weight (kg/kmol) for a gas, or density (kg/m³) for a liquid. */
    molecularWeightOrDensity: z.number().finite().positive().nullable().default(null),
    status: SegmentStatus.default('notStarted'),
    /** SEG-03: ESDV marker ids that bound this segment. */
    boundingEsdvIds: z.array(Id).default([]),
    /** SEG-04: drawings this segment spans. */
    drawingIds: z.array(Id).default([]),
    countedBy: ShortText,
    checkedBy: ShortText,
  })
  .meta({
    id: 'Segment',
    description: 'An isolatable segment between ESDVs; the unit of the parts count (SEG-02..05).',
  });

// ---------------------------------------------------------------------------
// Markers (ANN)
// ---------------------------------------------------------------------------

export const CircleGeometry = z.object({
  type: z.literal('circle'),
  cx: Coordinate,
  cy: Coordinate,
  r: PositiveNumber,
});

export const RectGeometry = z.object({
  type: z.literal('rect'),
  x: Coordinate,
  y: Coordinate,
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
});

export const PolylineGeometry = z.object({
  type: z.literal('polyline'),
  points: z.array(Point).min(2),
});

/** A highlighter stroke: a free-hand path painted `width` drawing units wide. */
export const StrokeGeometry = z.object({
  type: z.literal('stroke'),
  points: z.array(Point).min(2).max(5000),
  width: PositiveNumber,
});

/**
 * A double line across a pipe: two parallel lines `gap` drawing units apart,
 * one either side of the line from the first point to the second.
 */
export const DoubleLineGeometry = z.object({
  type: z.literal('doubleLine'),
  points: z.tuple([Point, Point]),
  gap: PositiveNumber,
});

export const MarkerGeometry = z.discriminatedUnion('type', [
  CircleGeometry,
  RectGeometry,
  PolylineGeometry,
  StrokeGeometry,
  DoubleLineGeometry,
]);

/** The geometry each marker shape is drawn with. */
const SHAPE_GEOMETRY: Record<z.output<typeof MarkerShape>, readonly string[]> = {
  circle: ['circle'],
  dashedHighlight: ['rect', 'polyline'],
  highlighter: ['stroke'],
  doubleLine: ['doubleLine'],
  // The bar across the pipe: its centre line and its thickness.
  endFlange: ['doubleLine'],
};

export const MarkerStyle = z.object({
  /** Label position relative to the marker's anchor, in drawing units. */
  labelOffset: z.object({ dx: Coordinate, dy: Coordinate }).nullable().default(null),
  /** How a circle marker is drawn. Dashed highlights and ESDVs are always 'circle'. */
  symbol: MarkerSymbol.default('circle'),
  /**
   * The outline of a free-form symbol: points relative to the circle's centre,
   * in units of its radius (so moving and resizing the circle carries it along).
   * Null for every other symbol.
   */
  outline: z.array(Point).min(3).max(2000).nullable().default(null),
});

/** SEG-01, SEG-08: data carried by an ESDV marker. */
export const EsdvData = z
  .object({
    tag: ShortText,
    nominalSize: z.number().finite().positive().nullable().default(null),
    sizeUnit: SizeUnit.default('in'),
    upstreamSegmentId: Id.nullable().default(null),
    downstreamSegmentId: Id.nullable().default(null),
    /** Per-ESDV override of the project boundary rule; null uses the project rule. */
    boundaryRuleOverride: EsdvBoundaryRule.nullable().default(null),
  })
  .meta({
    id: 'EsdvData',
    description: 'ESDV tag, size, adjoining segments and boundary rule override (SEG-01, SEG-08).',
  });

/** Data carried by an end flange marker: the end point of its segment. */
export const EndFlangeData = z
  .object({
    tag: ShortText,
    destination: EndFlangeDestination.default('closedDrain'),
  })
  .meta({
    id: 'EndFlangeData',
    description:
      'An end flange: where an isolatable segment ends at a closed drain, the flare or another end point.',
  });

export const Marker = z
  .object({
    id: Id,
    drawingId: Id,
    /** Owning segment (ANN-03). Null means unassigned, which is flagged before export. ESDVs use their up/downstream fields instead. */
    segmentId: Id.nullable().default(null),
    shape: MarkerShape,
    geometry: MarkerGeometry,
    style: MarkerStyle.prefault({}),
    /** Present when the marker is an ESDV (SEG-01). ESDVs are circles or double lines. */
    esdv: EsdvData.nullable().default(null),
    /** Present exactly when the marker is an end flange; its segment is `segmentId`. */
    endFlange: EndFlangeData.nullable().default(null),
  })
  .superRefine((marker, ctx) => {
    const allowed = SHAPE_GEOMETRY[marker.shape];
    if (!allowed.includes(marker.geometry.type)) {
      ctx.addIssue({
        code: 'custom',
        path: ['geometry'],
        message: `A ${marker.shape} marker needs ${allowed.join(' or ')} geometry`,
      });
    }
    if (marker.esdv && marker.shape !== 'circle' && marker.shape !== 'doubleLine') {
      ctx.addIssue({
        code: 'custom',
        path: ['esdv'],
        message: 'An ESDV marker must be a circle or a double line',
      });
    }
    if (marker.shape === 'doubleLine' && !marker.esdv) {
      ctx.addIssue({
        code: 'custom',
        path: ['esdv'],
        message: 'A double line marker must be an ESDV',
      });
    }
    if ((marker.shape === 'endFlange') !== (marker.endFlange !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endFlange'],
        message: 'An end flange marker needs end flange data, and only an end flange has it',
      });
    }
    const { symbol, outline } = marker.style;
    if (symbol !== 'circle' && (marker.shape !== 'circle' || marker.esdv)) {
      ctx.addIssue({
        code: 'custom',
        path: ['style', 'symbol'],
        message: 'Only an equipment circle marker can have another symbol',
      });
    }
    if ((symbol === 'freeform') !== (outline !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['style', 'outline'],
        message: 'A free-form symbol needs an outline, and only a free-form symbol has one',
      });
    }
  })
  .meta({
    id: 'Marker',
    description:
      'A circle (drawn as a ring, dot, square or free-form outline), dashed highlight, highlighter stroke, ESDV double line or end flange in drawing coordinates (ANN-01..03).',
  });

// ---------------------------------------------------------------------------
// Count items (CNT)
// ---------------------------------------------------------------------------

export const CountItem = z
  .object({
    id: Id,
    /** Stable, human-readable item number shown in labels and the item list. */
    seq: z.number().int().positive(),
    markerId: Id,
    segmentId: Id.nullable().default(null),
    drawingId: Id,
    /** Null until the user picks a type; such items are flagged as incomplete (CNT-05). */
    equipmentTypeId: Id.nullable().default(null),
    /** Nominal size in `sizeUnit` (e.g. 2 for 2", 50 for DN50). Null means not entered. */
    nominalSize: z.number().finite().positive().nullable().default(null),
    sizeUnit: SizeUnit.default('in'),
    /** CNT-03: only meaningful for equipment types with `hasActuation`. */
    actuation: Actuation.nullable().default(null),
    quantity: z.number().int().positive().default(1),
    tag: ShortText,
    remarks: Text,
    /** CNT-12: pipe run length in metres, entered by hand on dashed-highlight runs. */
    pipeLength: z.number().finite().nonnegative().nullable().default(null),
  })
  .meta({ id: 'CountItem', description: 'One row of the count, attached to a marker (CNT-01).' });

// ---------------------------------------------------------------------------
// Equipment library (CNT-02, CNT-04)
// ---------------------------------------------------------------------------

export const Bin = z
  .object({
    id: Id,
    label: z.string().min(1).max(50),
    /** Lower edge in inches; null means no lower limit. */
    lower: z.number().finite().nonnegative().nullable(),
    lowerInclusive: z.boolean(),
    /** Upper edge in inches; null means no upper limit. */
    upper: z.number().finite().positive().nullable(),
    upperInclusive: z.boolean(),
  })
  .superRefine((bin, ctx) => {
    if (bin.lower !== null && bin.upper !== null && bin.lower > bin.upper) {
      ctx.addIssue({
        code: 'custom',
        path: ['upper'],
        message: 'Upper edge must not be below lower edge',
      });
    }
  })
  .meta({
    id: 'Bin',
    description: 'A size range; edges are in inches and null means unbounded (CNT-04).',
  });

export const BinSet = z
  .object({
    id: Id,
    name: z.string().min(1).max(100),
    bins: z.array(Bin),
  })
  .meta({
    id: 'BinSet',
    description: 'A named set of size bins used by equipment types (CNT-04).',
  });

export const ActuationBinSets = z.object({
  manual: Id.nullable().default(null),
  automated: Id.nullable().default(null),
});

export const EquipmentType = z
  .object({
    id: Id,
    name: z.string().min(1).max(100),
    category: EquipmentCategory,
    /** CNT-03: valves carry an actuation class. */
    hasActuation: z.boolean().default(false),
    /** Default bin set for this type. */
    binSetId: Id.nullable().default(null),
    /** CNT-04: separate bin sets for manual and automated valves; null falls back to `binSetId`. */
    actuationBinSetIds: ActuationBinSets.prefault({}),
    /** Whether an item of this type is incomplete without a size (CNT-05). */
    sizeRequired: z.boolean().default(true),
    /** Key used in Excel mappings and exports. */
    excelKey: ShortText,
    /** Category name in the chosen leak frequency dataset (CNT-02). */
    datasetCategory: ShortText,
    /** ANN-08: single-key shortcut, or null. */
    shortcut: z.string().max(20).nullable().default(null),
  })
  .meta({
    id: 'EquipmentType',
    description:
      'A user-defined equipment type mapped to a leak frequency dataset category (CNT-02).',
  });

export const Library = z
  .object({
    /** Leak frequency dataset these types map to, e.g. "IOGP 434-01" (CNT-02). User-defined. */
    datasetName: ShortText,
    datasetDescription: Text,
    equipmentTypes: z.array(EquipmentType).default([]),
    binSets: z.array(BinSet).default([]),
    /** Equipment type ESDVs are counted as, under the boundary rule (SEG-08). */
    esdvEquipmentTypeId: Id.nullable().default(null),
  })
  .meta({
    id: 'Library',
    description: 'Equipment types and bin sets for this project (CNT-02, CNT-04).',
  });

// ---------------------------------------------------------------------------
// Notes (NTE)
// ---------------------------------------------------------------------------

export const Note = z
  .object({
    id: Id,
    segmentId: Id,
    /** Author initials (NTE-02). */
    author: z.string().max(20).default(''),
    timestamp: Timestamp,
    /** Note body in the minimal Markdown subset used by the notes editor: paragraphs, **bold** and "- " bullets (NTE-01). */
    text: Text,
    /** NTE-04: optional marker the note refers to. */
    markerRef: Id.nullable().default(null),
  })
  .meta({ id: 'Note', description: 'A timestamped segment note (NTE-01, NTE-02).' });

// ---------------------------------------------------------------------------
// Drawing links (LNK) — overlay only, never exported (LNK-04)
// ---------------------------------------------------------------------------

export const SavedView = z.object({
  /** Drawing coordinate at the centre of the view. */
  x: Coordinate,
  y: Coordinate,
  /** Zoom factor, 1 = 100 %. */
  zoom: PositiveNumber,
});

export const DrawingLink = z
  .object({
    id: Id,
    sourceDrawingId: Id,
    rect: Rect,
    targetDrawingId: Id.nullable(),
    targetView: SavedView.nullable().default(null),
    label: ShortText,
  })
  .meta({
    id: 'DrawingLink',
    description: 'A hotspot linking to another drawing; overlay only, never exported (LNK-01..04).',
  });

// ---------------------------------------------------------------------------
// Excel template mapping (section 7)
// ---------------------------------------------------------------------------

/** Cell reference like "D14", or a column like "D" in row-per-segment mode. */
export const CellRef = z
  .string()
  .regex(/^\$?[A-Za-z]{1,3}\$?(\d{1,7})?$/, 'Expected a cell reference such as D14');

export const HeaderField = z.enum([
  'projectName',
  'client',
  'facility',
  'studyRef',
  'segmentLabel',
  'segmentDescription',
  'equipment',
  'streamNumber',
  'fluid',
  'phase',
  /** "Liquid" or "Gas", as the A2.1 parts count sheet asks. */
  'phaseLiquidGas',
  'pressure',
  /** Pressure converted to bara from the project's pressure unit. */
  'pressureBara',
  'temperature',
  /** Temperature converted to °C from the project's temperature unit. */
  'temperatureC',
  'h2sMoleFraction',
  'molecularWeightOrDensity',
  'boundingEsdvTags',
  'linkedDrawingNumbers',
  'date',
  'countedBy',
  'checkedBy',
  'countRevision',
]);

export const ItemField = z.enum([
  'seq',
  'segmentLabel',
  'drawingNo',
  'drawingRevision',
  'equipmentType',
  'excelKey',
  'datasetCategory',
  'actuation',
  'nominalSize',
  'sizeUnit',
  'sizeInches',
  'bin',
  'quantity',
  'effectiveCount',
  'tag',
  'pipeLength',
  'remarks',
]);

export const CountCell = z.object({
  equipmentTypeId: Id,
  actuation: Actuation.nullable().default(null),
  binId: Id,
  cell: CellRef,
});

export const PipeLengthCell = z.object({
  binId: Id,
  cell: CellRef,
});

export const TemplateMapping = z
  .object({
    /** File name inside `templates/`. */
    templateFile: z.string().min(1).max(255),
    layoutMode: LayoutMode,
    /** Master sheet (sheet per segment) or target sheet (other modes). */
    sheet: z.string().min(1).max(31),
    /** First row written: segment rows (row per segment), first block (block per segment) or first item row (flat list). */
    startRow: z.number().int().positive().default(1),
    /** Rows between the starts of consecutive blocks (block per segment). */
    blockOffset: z.number().int().positive().nullable().default(null),
    /** Sheet name pattern for sheet per segment; `{segment}` is replaced by the label. */
    sheetNamePattern: z.string().max(100).default('{segment}'),
    headerFields: z.partialRecord(HeaderField, CellRef).default({}),
    countCells: z.array(CountCell).default([]),
    pipeLengthCells: z.array(PipeLengthCell).default([]),
    notesCell: CellRef.nullable().default(null),
    /** Notes written one line per cell (e.g. B72 … B77) instead of in one cell. */
    notesLines: z.array(CellRef).max(200).default([]),
    /** Characters per line when notes are split over `notesLines`. */
    notesLineLength: z.number().int().min(20).max(1000).default(90),
    /** Flat item list: column for each item field. */
    itemColumns: z.partialRecord(ItemField, CellRef).default({}),
  })
  .meta({
    id: 'TemplateMapping',
    description: 'Where count data lands in the client Excel template (FDS section 7).',
  });

// ---------------------------------------------------------------------------
// Duplicate tag decisions (CNT-08)
// ---------------------------------------------------------------------------

export const AcceptedDuplicate = z
  .object({
    /** Normalised tag (see `normaliseTag`). */
    tag: z.string().min(1).max(500),
    note: Text,
    acceptedAt: Timestamp,
  })
  .meta({
    id: 'AcceptedDuplicate',
    description: 'A duplicate tag the user has accepted (CNT-08).',
  });

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const AppInfo = z.object({
  name: z.string().default('qra-parts-count-tool'),
  version: z.string().default(''),
});

export const ProjectV1 = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION_1),
  /** Build that last wrote the file. */
  app: AppInfo.prefault({}),
  id: Id,
  name: z.string().min(1).max(200),
  client: ShortText,
  facility: ShortText,
  studyRef: ShortText,
  description: Text,
  /** Revision of the count shown in the PDF stamp, e.g. "A" or "1". */
  countRevision: z.string().max(20).default('A'),
  /** Defining segments, or counting parts once the segments are done. */
  stage: ProjectStage.default('segments'),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  /** Incremented on every save; export logs record it. */
  revision: z.number().int().nonnegative().default(0),
  settings: ProjectSettings,
  drawings: z.array(Drawing).default([]),
  segments: z.array(Segment).default([]),
  markers: z.array(Marker).default([]),
  items: z.array(CountItem).default([]),
  notes: z.array(Note).default([]),
  links: z.array(DrawingLink).default([]),
  library: Library.prefault({}),
  templateMapping: TemplateMapping.nullable().default(null),
  acceptedDuplicates: z.array(AcceptedDuplicate).default([]),
  /** Next value for `CountItem.seq`. */
  nextItemSeq: z.number().int().positive().default(1),
});
