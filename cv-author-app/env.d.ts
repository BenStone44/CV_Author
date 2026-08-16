/// <reference types="vite/client" />

declare module "virtual:chart-assets" {
  export const templateCatalog: Array<{
    name: string;
    chartType: string;
    coordinateSystem: "Cartesian" | "Polar" | "Geographic" | "CoordinateFree";
  }>;
  export const previewSrcByName: Map<string, string>;
  export const rawSvgSourceByName: Record<
    string,
    { id: string; loader: () => Promise<string> }
  >;
  export const coordinateAxesByName: Record<string, {
    origin: { x: number; y: number } | null;
    xAxisDirection: { x: number; y: number } | null;
    yAxisDirection: { x: number; y: number } | null;
  } | null>;
}
