import type { z } from 'zod';
import type * as v1 from './v1';

// Types for the current schema version, inferred from the Zod schemas (output
// types, i.e. after defaults are applied).

export type Project = z.output<typeof v1.ProjectV1>;
export type ProjectInput = z.input<typeof v1.ProjectV1>;
export type ProjectSettings = z.output<typeof v1.ProjectSettings>;
export type Units = z.output<typeof v1.Units>;
export type Drawing = z.output<typeof v1.Drawing>;
export type DrawingFileType = z.output<typeof v1.DrawingFileType>;
export type Segment = z.output<typeof v1.Segment>;
export type SegmentStatus = z.output<typeof v1.SegmentStatus>;
export type Marker = z.output<typeof v1.Marker>;
export type MarkerShape = z.output<typeof v1.MarkerShape>;
export type MarkerGeometry = z.output<typeof v1.MarkerGeometry>;
export type CircleGeometry = z.output<typeof v1.CircleGeometry>;
export type RectGeometry = z.output<typeof v1.RectGeometry>;
export type PolylineGeometry = z.output<typeof v1.PolylineGeometry>;
export type MarkerStyle = z.output<typeof v1.MarkerStyle>;
export type EsdvData = z.output<typeof v1.EsdvData>;
export type CountItem = z.output<typeof v1.CountItem>;
export type Bin = z.output<typeof v1.Bin>;
export type BinSet = z.output<typeof v1.BinSet>;
export type EquipmentType = z.output<typeof v1.EquipmentType>;
export type EquipmentCategory = z.output<typeof v1.EquipmentCategory>;
export type Library = z.output<typeof v1.Library>;
export type Note = z.output<typeof v1.Note>;
export type DrawingLink = z.output<typeof v1.DrawingLink>;
export type SavedView = z.output<typeof v1.SavedView>;
export type TemplateMapping = z.output<typeof v1.TemplateMapping>;
export type LayoutMode = z.output<typeof v1.LayoutMode>;
export type HeaderField = z.output<typeof v1.HeaderField>;
export type ItemField = z.output<typeof v1.ItemField>;
export type CountCell = z.output<typeof v1.CountCell>;
export type PipeLengthCell = z.output<typeof v1.PipeLengthCell>;
export type AcceptedDuplicate = z.output<typeof v1.AcceptedDuplicate>;
export type EsdvBoundaryRule = z.output<typeof v1.EsdvBoundaryRule>;
export type FlangeConvention = z.output<typeof v1.FlangeConvention>;
export type SizeUnit = z.output<typeof v1.SizeUnit>;
export type Actuation = z.output<typeof v1.Actuation>;
export type Rect = z.output<typeof v1.Rect>;
export type Point = z.output<typeof v1.Point>;
export type Size2D = z.output<typeof v1.Size2D>;
