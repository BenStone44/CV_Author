type GalleryCaseConfiguration = {
  configure: (context: Record<string, unknown>, ...args: unknown[]) => Promise<boolean>;
};

const configurations = import.meta.glob<GalleryCaseConfiguration>(
  "../../public/site/gallery/cases/*/configure.js",
);

/** Load a bundled case-owned module; chart operations stay in the editor. */
export async function runGalleryCase(slug: string, context: Record<string, unknown>, ...args: unknown[]): Promise<boolean> {
  const load = configurations[`../../public/site/gallery/cases/${slug}/configure.js`];
  if (!load) throw new Error(`Unknown Gallery case: ${slug}`);
  const configuration = await load();
  return configuration.configure(context, ...args);
}
