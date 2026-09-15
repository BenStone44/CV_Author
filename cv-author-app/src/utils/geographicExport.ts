/** Capture the live geographic renderer at an explicit export boundary. */
const exporters = new Map<string, () => Promise<string>>();
export function registerGeographicExporter(id: string, exporter: () => Promise<string>) {
  exporters.set(id, exporter);
  return () => { if (exporters.get(id) === exporter) exporters.delete(id); };
}
export async function captureGeographicContent(id: string) {
  const exporter = exporters.get(id);
  if (!exporter) throw new Error(`Geographic renderer is not mounted: ${id}`);
  return exporter();
}
