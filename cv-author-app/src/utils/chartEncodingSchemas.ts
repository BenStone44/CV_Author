/**
 * Compatibility adapter. Chart contracts are defined exclusively in
 * `chartContracts.ts`; this module remains for callers that historically
 * imported encoding schemas from this path.
 */
export {
  chartContracts,
  chartEncodingSchemas,
  chartTemplateContracts,
  getChartContract,
  getChartEncodingSchema,
  normalizeChartFamily,
} from "./chartContracts";
export type {
  EncodingEmptyLabel,
  EncodingRole,
  ChartChannelContract,
  ChartContract,
  ChartEncodingChannelSchema,
  ChartEncodingSchema,
  ChartDimensionUpgradeSchema,
  ChartRoleContract,
  ChartRendererKey,
  SupportedChartType,
} from "./chartContracts";
