<script setup lang="ts">
import { computed } from "vue";
import { X } from "@lucide/vue";
import CubeEncodingChannelField from "./CubeEncodingChannelField.vue";
import EncodingChannelField from "./EncodingChannelField.vue";
import VisualMappingEditor from "./VisualMappingEditor.vue";
import {
  getEncodingChannelConfigsForSpec,
  hasDerivedValueSeries,
  resolvedEncodingField,
  resolvedPolarRadiusMode,
  resolveChartEncodingIssues,
  resolvedSeriesField,
  resolveChartTemplateVariant,
} from "./encodingConfig";
import type { EncodingChannelConfig } from "./encodingConfig";
import { normalizeChartTemplate } from "./chartTemplates";
import { semanticSlotForChannel } from "./chartTemplates";
import type {
  ChartEncodingChannel,
  ChartSpec,
  DataColumn,
  LineSeriesShape,
  LinearColorMapping,
  LinearSizeMapping,
  MarkGroupSharedConfig,
  SeriesStyleMapping,
} from "./types";
import {
  defaultColorMapping,
  defaultSizeMapping,
  isCategoricalColorMapping,
  isLinearColorMapping,
  isLinearSizeMapping,
  isSeriesStyleMapping,
} from "./visualMapping";
import {
  compileCubeValueSeries,
  cubeBindingMeasureIds,
  cubeSeriesColor,
  summarizeCubeBinding,
  type CubeResult,
} from "./cubeModel";

const props = defineProps<{
  chartName: string;
  chartSpec: ChartSpec;
  columns: DataColumn[];
  cubeResult?: CubeResult;
  markConfig: MarkGroupSharedConfig;
  rendererError?: string;
  compatibilityMessage?: string;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [];
  channelChange: [channel: ChartEncodingChannel, field: string];
  seriesFieldChange: [field: string];
  valueSeriesFieldsChange: [fields: string[]];
  cubeSourceMembersChange: [target: ChartEncodingChannel | "series", sourceId: string, memberIds: string[]];
  angleFieldsChange: [fields: string[]];
  parallelFieldsChange: [fields: string[]];
  cubeMemberColorChange: [styleKey: string, color: string];
  markConfigChange: [patch: MarkGroupSharedConfig];
}>();

const template = computed(() => normalizeChartTemplate(props.chartSpec.chartType));
const normalizedChartType = computed(() => props.chartSpec.chartType.replace(/[\s_-]/g, "").toLowerCase());
const configs = computed(() => getEncodingChannelConfigsForSpec(props.chartSpec));
const isPolar = computed(() => template.value === "pie" || template.value === "donut");
const isMultiLine = computed(() => resolveChartTemplateVariant(props.chartSpec) === "line-multi");
const isExplicitMultiLine = computed(() => normalizedChartType.value === "multilinechart");
const areaRequiresSeries = computed(() => {
  if (template.value !== "area") return false;
  const type = normalizedChartType.value;
  return type.includes("stacked") || type.includes("stream") || type.includes("horizon");
});
const supportsMeasureSeries = computed(() => isExplicitMultiLine.value || areaRequiresSeries.value);
const usesDerivedSeries = computed(() => hasDerivedValueSeries(props.chartSpec, "y"));
const isParallel = computed(() => template.value === "parallel");
const standardConfigs = computed(() => configs.value.filter((config) => {
  if (isPolar.value && config.channel === "angle") return false;
  if (isPolar.value && config.channel === "radius") return false;
  if (isParallel.value && config.channel === "dimensions") return false;
  if (supportsMeasureSeries.value && config.channel === "color") return false;
  return true;
}));
const seriesConfig = computed<EncodingChannelConfig | null>(() => (isMultiLine.value || areaRequiresSeries.value) && !usesDerivedSeries.value ? {
  channel: "color",
  label: "Series",
  role: "series",
  required: true,
  accepts: ["nominal", "temporal"],
  emptyLabel: "Not bound",
} : null);
const seriesMembers = computed(() => {
  const field = resolvedSeriesField(props.chartSpec);
  if (!field || !props.cubeResult) return [];
  return props.cubeResult.schema.dimensions.find((dimension) => dimension.id === field)?.members ?? [];
});
const selectedValueSeriesFields = computed(() => {
  const source = props.chartSpec.cubeBinding?.slots.y;
  if (source?.kind === "measure") return [source.measureId];
  if (source?.kind === "measure-set") return source.measureIds;
  const field = resolvedEncodingField(props.chartSpec, "y");
  return field ? [field] : [];
});
const editableSeriesMembers = computed(() => usesDerivedSeries.value && props.cubeResult
  ? selectedValueSeriesFields.value.map((measureId) => {
    const measure = props.cubeResult!.schema.measures.find((item) => item.id === measureId);
    return { id: measureId, label: measure?.label ?? measureId };
  })
  : seriesMembers.value);
const seriesStyleMapping = computed<SeriesStyleMapping>(() => {
  if (isSeriesStyleMapping(props.markConfig.seriesStyleMapping)) return props.markConfig.seriesStyleMapping;
  const legacy = isCategoricalColorMapping(props.markConfig.seriesColorMapping)
    ? props.markConfig.seriesColorMapping.values
    : {};
  return {
    type: "series-style",
    values: Object.fromEntries(Object.entries(legacy).map(([memberId, color]) => [memberId, { color }])),
  };
});
const quantitativeColumns = computed(() => props.columns.filter((column) => column.type === "quantitative"));
const cubeThetaSlot = computed(() => props.chartSpec.cubeBinding?.slots.theta ? "theta" : "value");
const selectedAngleFields = computed(() => cubeBindingMeasureIds(props.chartSpec.cubeBinding, cubeThetaSlot.value).length > 0
  ? cubeBindingMeasureIds(props.chartSpec.cubeBinding, cubeThetaSlot.value)
  : props.chartSpec.angleFields?.map((encoding) => encoding.field)
  ?? (props.chartSpec.encodings.angle ? [props.chartSpec.encodings.angle.field] : []));
const selectedParallelFields = computed(() => props.chartSpec.parallelFields?.map((encoding) => encoding.field) ?? []);
const radiusMode = computed(() => resolvedPolarRadiusMode(props.chartSpec));
const staticOuterRadius = computed(() => typeof props.markConfig.outerRadius === "number"
  ? props.markConfig.outerRadius
  : 1);
const colorConfig = computed(() => configs.value.find((config) => config.channel === "color"));
const sizeConfig = computed(() => configs.value.find((config) => config.channel === "size"));
const colorField = computed(() => resolvedEncodingField(props.chartSpec, "color"));
const sizeField = computed(() => resolvedEncodingField(props.chartSpec, "size"));
const colorColumn = computed(() => props.columns.find((column) => column.name === colorField.value));
const showColorMapping = computed(() => !!colorColumn.value && colorColumn.value.type !== "nominal");
const showSizeMapping = computed(() => !!sizeField.value);
const staticColor = computed(() => typeof props.markConfig.color === "string" ? props.markConfig.color : "#2563eb");
const staticSize = computed(() => typeof props.markConfig.size === "number" ? props.markConfig.size : 4);
const horizonBands = computed(() => typeof props.markConfig.bands === "number" ? props.markConfig.bands : 7);
const treemapTile = computed(() => typeof props.markConfig.tile === "string" ? props.markConfig.tile : "binary");
const hexbinRadius = computed(() => typeof props.markConfig.radius === "number" ? props.markConfig.radius : 8);
const sankeyAlignment = computed(() => typeof props.markConfig.nodeAlign === "string" ? props.markConfig.nodeAlign : "justify");
const sankeyLinkColor = computed(() => typeof props.markConfig.linkColor === "string" ? props.markConfig.linkColor : "source-target");
const colorMapping = computed(() => isLinearColorMapping(props.markConfig.colorMapping) ? props.markConfig.colorMapping : defaultColorMapping);
const sizeMapping = computed(() => isLinearSizeMapping(props.markConfig.sizeMapping) ? props.markConfig.sizeMapping : defaultSizeMapping);
const cubeSeriesRows = computed(() => {
  if (!props.cubeResult || !props.chartSpec.cubeBinding?.slots[cubeThetaSlot.value]) return [];
  const compiled = compileCubeValueSeries(props.cubeResult, props.chartSpec.cubeBinding, cubeThetaSlot.value, "slice");
  return compiled.errors.length > 0 ? [] : compiled.rows;
});
const cubeBindingSummary = computed(() => props.cubeResult
  ? summarizeCubeBinding(props.cubeResult, props.chartSpec.cubeBinding, template.value)
  : "");
const fallbackSeriesColors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f"];
function seriesMemberColor(memberId: string, index: number) {
  return seriesStyleMapping.value.values[memberId]?.color
    ?? fallbackSeriesColors[index % fallbackSeriesColors.length]!;
}
function seriesMemberStrokeWidth(memberId: string) {
  return seriesStyleMapping.value.values[memberId]?.strokeWidth
    ?? Number(props.markConfig.strokeWidth ?? 2.5);
}
function seriesMemberShape(memberId: string): LineSeriesShape {
  return seriesStyleMapping.value.values[memberId]?.shape ?? "solid";
}
function updateSeriesMemberStyle(memberId: string, patch: { color?: string; strokeWidth?: number; shape?: LineSeriesShape }) {
  emit("markConfigChange", {
    seriesStyleMapping: {
      type: "series-style",
      values: {
        ...seriesStyleMapping.value.values,
        [memberId]: { ...seriesStyleMapping.value.values[memberId], ...patch },
      },
    },
  });
}
function cubeRowColor(styleKey: string, index: number) {
  return cubeSeriesColor(props.chartSpec.cubeBinding, styleKey)
    ?? fallbackSeriesColors[index % fallbackSeriesColors.length]!;
}
const canConfirm = computed(() => resolveChartEncodingIssues(props.chartSpec).length === 0
  && (!supportsMeasureSeries.value || usesDerivedSeries.value || !!resolvedSeriesField(props.chartSpec))
  && configs.value.every((config) => {
  if (!config.required) return true;
  if (config.channel === "angle" && props.chartSpec.cubeBinding?.slots[cubeThetaSlot.value]) return true;
  if (config.channel === "dimensions") return selectedParallelFields.value.length >= 2;
  if (config.channel === "color" && usesDerivedSeries.value) return true;
  if (config.multiple) return selectedAngleFields.value.length > 0;
  return !!resolvedEncodingField(props.chartSpec, config.channel);
}));

function cubeSource(target: ChartEncodingChannel | "series") {
  if (!props.cubeResult) return undefined;
  const slot = target === "series" ? "series" : semanticSlotForChannel(props.chartSpec.chartType, target);
  const source = slot ? props.chartSpec.cubeBinding?.slots[slot] : undefined;
  if (source?.kind === "dimension") {
    const dimension = props.cubeResult.schema.dimensions.find((item) => item.id === source.dimensionId);
    return {
      sourceId: source.dimensionId,
      memberIds: source.memberIds?.length
        ? source.memberIds
        : dimension?.members.map((member) => member.id) ?? [],
    };
  }
  if (source?.kind === "measure") return { sourceId: "__measures__", memberIds: [source.measureId] };
  if (source?.kind === "measure-set") return { sourceId: "__measures__", memberIds: source.measureIds };

  const field = target === "series"
    ? resolvedSeriesField(props.chartSpec)
    : resolvedEncodingField(props.chartSpec, target);
  if (props.cubeResult.schema.measures.some((measure) => measure.id === field)) {
    return { sourceId: "__measures__", memberIds: [field] };
  }
  const dimension = props.cubeResult.schema.dimensions.find((item) => item.id === field);
  return dimension
    ? { sourceId: dimension.id, memberIds: dimension.members.map((member) => member.id) }
    : { sourceId: "", memberIds: [] };
}

function updateCubeSource(
  target: ChartEncodingChannel | "series",
  sourceId: string,
  memberIds: string[],
) {
  emit("cubeSourceMembersChange", target, sourceId, memberIds);
}

function toggleAngleField(field: string) {
  emit("angleFieldsChange", selectedAngleFields.value.includes(field)
    ? selectedAngleFields.value.filter((item) => item !== field)
    : [...selectedAngleFields.value, field]);
}

function toggleParallelField(field: string) {
  emit("parallelFieldsChange", selectedParallelFields.value.includes(field)
    ? selectedParallelFields.value.filter((item) => item !== field)
    : [...selectedParallelFields.value, field]);
}

function updateMappingDefaults(channel: ChartEncodingChannel, field: string) {
  emit("channelChange", channel, field);
  const column = props.columns.find((item) => item.name === field);
  if (channel === "color" && column && column.type !== "nominal" && !isLinearColorMapping(props.markConfig.colorMapping)) {
    emit("markConfigChange", { colorMapping: defaultColorMapping });
  }
  if (channel === "size" && field && !isLinearSizeMapping(props.markConfig.sizeMapping)) {
    emit("markConfigChange", { sizeMapping: defaultSizeMapping });
  }
}
</script>

<template>
  <div class="encoding-config">
    <header class="encoding-config__header">
      <div>
        <strong>MARK ENCODINGS</strong>
        <span>{{ chartName }}</span>
      </div>
      <button type="button" title="Close" aria-label="Close encoding panel" @click="emit('close')">
        <X :size="16" :stroke-width="1.6" aria-hidden="true" />
      </button>
    </header>

    <div v-if="columns.length" class="encoding-config__channels">
      <p v-if="cubeBindingSummary" class="encoding-config__summary">{{ cubeBindingSummary }}</p>

      <template v-for="config in standardConfigs" :key="config.channel">
        <CubeEncodingChannelField
          v-if="cubeResult && config.role !== 'style'"
          :config="config"
          :cube-result="cubeResult"
          :source-id="cubeSource(config.channel)?.sourceId ?? ''"
          :member-ids="cubeSource(config.channel)?.memberIds ?? []"
          :multiple-measures="supportsMeasureSeries && config.channel === 'y'"
          @source-change="(sourceId, memberIds) => updateCubeSource(config.channel, sourceId, memberIds)"
          @members-change="(memberIds) => updateCubeSource(config.channel, cubeSource(config.channel)?.sourceId ?? '', memberIds)"
        />
        <EncodingChannelField
          v-else
          :config="config"
          :columns="columns"
          :value="resolvedEncodingField(chartSpec, config.channel)"
          @change="updateMappingDefaults(config.channel, $event)"
        />
      </template>

      <p v-if="usesDerivedSeries" class="encoding-config__derived-series">
        Series: selected measure names
      </p>

      <CubeEncodingChannelField
        v-if="seriesConfig && cubeResult"
        :config="seriesConfig"
        :cube-result="cubeResult"
        :source-id="cubeSource('series')?.sourceId ?? ''"
        :member-ids="cubeSource('series')?.memberIds ?? []"
        @source-change="(sourceId, memberIds) => updateCubeSource('series', sourceId, memberIds)"
        @members-change="(memberIds) => updateCubeSource('series', cubeSource('series')?.sourceId ?? '', memberIds)"
      />

      <EncodingChannelField
        v-else-if="seriesConfig"
        :config="seriesConfig"
        :columns="columns"
        :value="resolvedSeriesField(chartSpec)"
        @change="emit('seriesFieldChange', $event)"
      />

      <section v-if="isPolar" class="encoding-config__angle" aria-label="Theta measures">
        <span>Theta <abbr title="Required" aria-label="Required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedAngleFields.includes(column.name)"
            @change="toggleAngleField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="isParallel" class="encoding-config__angle" aria-label="Parallel dimensions">
        <span>Numeric dimensions <abbr title="At least two required" aria-label="At least two required">*</abbr></span>
        <label v-for="column in quantitativeColumns" :key="column.name">
          <input
            type="checkbox"
            :checked="selectedParallelFields.includes(column.name)"
            @change="toggleParallelField(column.name)"
          />
          <span>{{ column.name }}</span>
        </label>
      </section>

      <section v-if="isPolar" class="encoding-config__radius" aria-label="R axis encoding">
        <div class="encoding-config__radius-heading">
          <span>R / Outer radius</span>
          <strong>{{ radiusMode === "static" ? "Static" : "Mapped" }}</strong>
        </div>
        <EncodingChannelField
          :config="configs.find((config) => config.channel === 'radius')!"
          :columns="columns"
          :value="resolvedEncodingField(chartSpec, 'radius')"
          @change="emit('channelChange', 'radius', $event)"
        />
        <label v-if="radiusMode === 'static'" class="encoding-config__static encoding-config__static-radius">
          <span>Outer radius</span>
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            :value="staticOuterRadius"
            @input="emit('markConfigChange', { outerRadius: Number(($event.target as HTMLInputElement).value) })"
          />
          <output>{{ Math.round(staticOuterRadius * 100) }}%</output>
        </label>
      </section>
    </div>
    <p v-else class="encoding-config__empty">Import a CSV to bind channels.</p>

    <section v-if="normalizedChartType.includes('horizon')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Bands</span>
        <input type="range" min="1" max="9" step="1" :value="horizonBands" @input="emit('markConfigChange', { bands: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ horizonBands }}</output>
      </label>
    </section>

    <section v-if="normalizedChartType.includes('treemap')" class="encoding-config__appearance">
      <label class="encoding-config__option">
        <span>Tiling method</span>
        <select :value="treemapTile" @change="emit('markConfigChange', { tile: ($event.target as HTMLSelectElement).value })">
          <option value="binary">Binary</option>
          <option value="squarify">Squarify</option>
          <option value="slice-dice">Slice-dice</option>
          <option value="slice">Slice</option>
          <option value="dice">Dice</option>
        </select>
      </label>
    </section>

    <section v-if="normalizedChartType.includes('hexbin')" class="encoding-config__appearance">
      <label class="encoding-config__static">
        <span>Radius</span>
        <input type="range" min="2" max="20" step="1" :value="hexbinRadius" @input="emit('markConfigChange', { radius: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ hexbinRadius }} px</output>
      </label>
    </section>

    <section v-if="normalizedChartType.includes('sankey')" class="encoding-config__appearance">
      <label class="encoding-config__option">
        <span>Node alignment</span>
        <select :value="sankeyAlignment" @change="emit('markConfigChange', { nodeAlign: ($event.target as HTMLSelectElement).value })">
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="center">Center</option>
          <option value="justify">Justify</option>
        </select>
      </label>
      <label class="encoding-config__option">
        <span>Link color</span>
        <select :value="sankeyLinkColor" @change="emit('markConfigChange', { linkColor: ($event.target as HTMLSelectElement).value })">
          <option value="source-target">Source-target</option>
          <option value="source">Source</option>
          <option value="target">Target</option>
          <option value="static">Static</option>
        </select>
      </label>
    </section>

    <section v-if="editableSeriesMembers.length || colorConfig || sizeConfig" class="encoding-config__appearance">
      <div v-if="editableSeriesMembers.length" class="encoding-config__member-styles">
        <header>
          <span>Series styles</span>
          <span>Color</span>
          <span>Width</span>
          <span>Line style</span>
        </header>
        <label v-for="(member, index) in editableSeriesMembers" :key="member.id">
          <span :title="member.label">{{ member.label }}</span>
          <input
            type="color"
            :value="seriesMemberColor(member.id, index)"
            :aria-label="`${member.label} series color`"
            @input="updateSeriesMemberStyle(member.id, { color: ($event.target as HTMLInputElement).value })"
          />
          <input
            type="number"
            min="0.5"
            max="16"
            step="0.5"
            :value="seriesMemberStrokeWidth(member.id)"
            :aria-label="`${member.label} stroke width`"
            @change="updateSeriesMemberStyle(member.id, { strokeWidth: Number(($event.target as HTMLInputElement).value) })"
          />
          <select
            :value="seriesMemberShape(member.id)"
            :aria-label="`${member.label} line style`"
            @change="updateSeriesMemberStyle(member.id, { shape: ($event.target as HTMLSelectElement).value as LineSeriesShape })"
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
        </label>
      </div>
      <div v-if="cubeSeriesRows.length" class="encoding-config__member-colors">
        <span>Series colors</span>
        <label v-for="(row, index) in cubeSeriesRows" :key="row.styleKey">
          <span :title="row.seriesKey">{{ row.seriesKey }}</span>
          <input
            type="color"
            :value="cubeRowColor(row.styleKey, index)"
            @input="emit('cubeMemberColorChange', row.styleKey, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
      <label v-if="!isMultiLine && colorConfig && !colorField && !cubeSeriesRows.length" class="encoding-config__static">
        <span>Color value</span>
        <input type="color" :value="staticColor" @input="emit('markConfigChange', { color: ($event.target as HTMLInputElement).value })" />
      </label>
      <label v-if="!isMultiLine && sizeConfig && !sizeField" class="encoding-config__static">
        <span>Size value</span>
        <input type="range" min="1" max="48" step="0.5" :value="staticSize" @input="emit('markConfigChange', { size: Number(($event.target as HTMLInputElement).value) })" />
        <output>{{ staticSize }} px</output>
      </label>
      <VisualMappingEditor
        v-if="!isMultiLine"
        :show-color="showColorMapping"
        :show-size="showSizeMapping"
        :color-mapping="colorMapping"
        :size-mapping="sizeMapping"
        @color-change="(mapping: LinearColorMapping) => emit('markConfigChange', { colorMapping: mapping })"
        @size-change="(mapping: LinearSizeMapping) => emit('markConfigChange', { sizeMapping: mapping })"
      />
    </section>

    <p v-if="compatibilityMessage" class="encoding-config__error">{{ compatibilityMessage }}</p>
    <p v-else-if="rendererError" class="encoding-config__error">{{ rendererError }}</p>
    <div class="encoding-config__actions">
      <button type="button" :disabled="!canConfirm" @click="emit('confirm')">Confirm encodings</button>
    </div>
  </div>
</template>

<style scoped>
.encoding-config { display: grid; gap: 14px; }
.encoding-config__header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.encoding-config__header > div { display: grid; min-width: 0; gap: 2px; }
.encoding-config__header strong { color: #18212f; font-size: 12px; letter-spacing: 0.08em; }
.encoding-config__header span { overflow: hidden; color: #6b7889; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__header button { display: inline-grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #5b6a80; cursor: pointer; }
.encoding-config__header button:hover { background: #edf5fc; color: #1554b2; }
.encoding-config__channels { display: grid; gap: 12px; }
.encoding-config__summary { margin: 0; padding: 8px 9px; border-left: 3px solid #1980bd; background: #f3f7fa; color: #334155; font-size: 11px; line-height: 1.45; }
.encoding-config__derived-series { margin: -4px 0 0; color: #1554b2; font-size: 11px; }
.encoding-config__angle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 2px; color: #516176; font-size: 11px; }
.encoding-config__angle > span { grid-column: 1 / -1; }
.encoding-config__angle abbr { color: #b42318; text-decoration: none; }
.encoding-config__angle label { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 6px 7px; border: 1px solid rgba(24, 33, 47, 0.1); border-radius: 5px; background: #f8fafc; color: #334155; cursor: pointer; }
.encoding-config__angle input { width: 14px; height: 14px; flex: 0 0 14px; margin: 0; accent-color: #1554b2; }
.encoding-config__angle label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__radius, .encoding-config__appearance { display: grid; gap: 9px; padding-top: 12px; border-top: 1px solid rgba(24, 33, 47, 0.1); color: #516176; font-size: 11px; }
.encoding-config__radius-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.encoding-config__radius-heading strong { color: #1554b2; font-size: 10px; font-weight: 700; }
.encoding-config__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; padding: 3px; border-radius: 6px; background: #edf1f5; }
.encoding-config__segments button { min-height: 28px; border: 0; border-radius: 4px; background: transparent; color: #5b6878; font: inherit; cursor: pointer; }
.encoding-config__segments button.is-active { background: #fff; color: #1554b2; box-shadow: 0 1px 2px rgba(24, 33, 47, 0.14); font-weight: 700; }
.encoding-config__static { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.encoding-config__option { display: grid; grid-template-columns: minmax(92px, 1fr) minmax(0, 1.25fr); align-items: center; gap: 8px; }
.encoding-config__option select { width: 100%; height: 30px; padding: 0 7px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #223041; font: inherit; }
.encoding-config__member-colors { display: grid; gap: 7px; }
.encoding-config__member-colors > span { color: #334155; font-weight: 650; }
.encoding-config__member-colors label { display: grid; grid-template-columns: minmax(0, 1fr) 38px; align-items: center; gap: 8px; }
.encoding-config__member-colors label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-colors input { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles { display: grid; gap: 7px; }
.encoding-config__member-styles header,
.encoding-config__member-styles label { display: grid; grid-template-columns: minmax(62px, 1fr) 34px 46px 70px; align-items: center; gap: 5px; }
.encoding-config__member-styles header { color: #687585; font-size: 9px; }
.encoding-config__member-styles header span:first-child { color: #334155; font-size: 11px; font-weight: 650; }
.encoding-config__member-styles label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.encoding-config__member-styles input[type="color"] { width: 34px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__member-styles input[type="number"],
.encoding-config__member-styles select { width: 100%; min-width: 0; height: 28px; padding: 0 4px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; color: #223041; font: inherit; font-size: 9px; }
.encoding-config__static input[type="color"] { width: 38px; height: 28px; padding: 2px; border: 1px solid rgba(24, 33, 47, 0.14); border-radius: 5px; background: #fff; }
.encoding-config__static input[type="range"] { width: 100%; accent-color: #1980bd; }
.encoding-config__static output { min-width: 40px; color: #687585; font-variant-numeric: tabular-nums; text-align: right; }
.encoding-config__empty, .encoding-config__error { margin: 0; font-size: 11px; line-height: 1.4; }
.encoding-config__empty { color: #6b7889; }
.encoding-config__error { color: #b42318; }
.encoding-config__actions { display: flex; justify-content: flex-end; }
.encoding-config__actions button { min-height: 32px; padding: 0 10px; border: 1px solid #1554b2; border-radius: 6px; background: #1554b2; color: #fff; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.encoding-config__actions button:disabled { cursor: default; opacity: 0.45; }
</style>
