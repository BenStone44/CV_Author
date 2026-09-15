export type ApiRoleSpecification = {
  id: string
  label: string
  kind: string
  channel: string
  required: boolean
  accepts: string[]
  minFields: number
  maxFields: number
  bindingModes: Array<{ kind: string; minFields: number; maxFields: number }>
}

export type ApiSpatialReference = {
  id: string
  kind: string
  semantic: string
  exposure: string
  compatibility: string
  placement?: { channel: string; boundary?: string; concatDirection?: string }
}

export type ApiDropArea = {
  id: string
  operation: string
  geometry: { kind: string; boundary?: string; targetId?: string }
  sharedReferenceIds: string[]
}

export type ApiBlockSpecification = {
  schemaVersion: 1
  id: string
  revision: number
  chartType: string
  aliases: string[]
  label: string
  families: string[]
  dataShape: string
  data: unknown
  roles: ApiRoleSpecification[]
  coordinateSystem: 'Cartesian' | 'Polar' | 'CoordinateFree' | 'Geographic'
  spatialReferences: ApiSpatialReference[]
  structuralTargets: Array<{
    id: string
    markRole: string
    repeated: boolean
    contextRoleIds: string[]
    anchorReferenceId: string
  }>
  composition: {
    layer: { enabled: boolean }
    concat: { enabled: boolean }
    facet: { enabled: boolean }
    nested: { asParent: boolean; asChild: boolean }
    capabilities: string[]
    dropAreas: ApiDropArea[]
  }
  renderer: { kind: string; key: string; version: number }
  catalog: {
    candidateId: string
    label: string
    previewKey: string
    defaultSize: { width: number; height: number }
    familyOrder?: Record<string, number>
    hidden?: boolean
    unavailable?: boolean
  }
  image: string
}

export type ApiCatalog = {
  schemaVersion: 1
  source: 'chartBlockRegistry'
  families: Array<{ id: string; label: string }>
  blocks: ApiBlockSpecification[]
}

export async function loadApiCatalog(): Promise<ApiCatalog> {
  const response = await fetch('/site/api/chart-blocks.json')
  if (!response.ok) throw new Error('Chart Block API reference is unavailable')
  return response.json()
}
