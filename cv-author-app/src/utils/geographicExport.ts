/** Capture the live geographic renderer at an explicit export boundary. */
const exporters = new Map<string, () => Promise<string>>();
const EXPORTER_MOUNT_TIMEOUT_MS = 10_000;

export function registerGeographicExporter(id: string, exporter: () => Promise<string>) {
  exporters.set(id, exporter);
  return () => { if (exporters.get(id) === exporter) exporters.delete(id); };
}

export async function captureGeographicContent(id: string) {
  const deadline = Date.now() + EXPORTER_MOUNT_TIMEOUT_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const exporter = exporters.get(id);
    if (exporter) {
      try {
        return await exporter();
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "Map renderer unavailable") throw error;
        lastError = error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  if (lastError) throw lastError;
  throw new Error(`Geographic renderer is not mounted: ${id}`);
}
