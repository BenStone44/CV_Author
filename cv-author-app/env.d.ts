/// <reference types="vite/client" />

declare module "virtual:chart-assets" {
  export const previewSrcByName: Map<string, string>;
  export const rawSvgSourceByName: Record<
    string,
    { id: string; loader: () => Promise<string> }
  >;
}
