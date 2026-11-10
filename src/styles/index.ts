export type Pattern = 'hatch' | 'cross' | 'lines' | 'dots' | 'waves';

export type AreaPaint = {
  color: string;
  pattern?: Pattern;
  patternColor?: string;
  gap?: number;
  weight?: number;
};

export type RoadPaint = {
  fill: string;
  edge: string;
  edgeRatio: number;
  path: string;
  colors?: Record<string, string>;
};

export type StyleSpec = {
  id: string;
  name: string;
  note: string;
  order: number;
  paper: string;
  ink: string;
  outline: number;
  buildings: string[];
  buildingPattern?: AreaPaint;
  water: AreaPaint;
  park: AreaPaint;
  wood: AreaPaint;
  sand: AreaPaint;
  road: RoadPaint;
  rail: string;
};

const files = import.meta.glob('./roughmaps/*.json', { eager: true, import: 'default' });

export const STYLES: StyleSpec[] = (Object.values(files) as StyleSpec[]).sort((a, b) => a.order - b.order);
