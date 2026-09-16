export type GalleryItem = {
  slug: string
  number: string
  title: string
  description: string
  image: string
  thumbnail: string
  tags: string[]
  blocks: string[]
  coordinateSystems: string[]
  file: {
    type: string
    name: string
    description: string
    files: string[]
  }
  bindings: Array<{
    field: string
    role: string
  }>
  composition: string
  tryHref: string
  caseHref?: string
  editorHelp?: {
    introduction: string
    steps: Array<{
      title: string
      source: string
      target: string
      action: string
      result: string
    }>
  }
}

/** Read the same case-owned metadata used by downloads and editor recordings. */
export async function loadGalleryItems(): Promise<GalleryItem[]> {
  const base = '/site/gallery/cases'
  const read = async (path: string) => {
    const response = await fetch(path)
    if (!response.ok) throw new Error(`Gallery asset unavailable: ${path}`)
    return response.json()
  }
  const slugs: string[] = await read(`${base}/index.json`)
  return Promise.all(slugs.map(async (slug) => {
    const entry = await read(`${base}/${slug}/case.json`)
    if (
      entry.slug !== slug
      || typeof entry.starter !== 'string'
      || typeof entry.completedCase !== 'string'
      || !entry.gallery
      || typeof entry.preview?.thumbnail?.path !== 'string'
      || typeof entry.preview?.thumbnail?.sha256 !== 'string'
    ) {
      throw new Error(`Invalid Gallery case metadata: ${slug}`)
    }
    return {
      ...entry.gallery, slug,
      image: `${base}/${slug}/${entry.preview.path}?v=${entry.preview.sha256.slice(0, 12)}`,
      thumbnail: `${base}/${slug}/${entry.preview.thumbnail.path}?v=${entry.preview.thumbnail.sha256.slice(0, 12)}`,
      tryHref: `/editor/?starter=${entry.starter}`,
      caseHref: `/editor/?case=${entry.completedCase}`,
    }
  }))
}
