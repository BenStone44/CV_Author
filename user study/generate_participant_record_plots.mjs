import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const participants = [
  { id: 'P01', DI: { seconds: 727, help: 6 }, TB: { seconds: 709, help: 4 }, CP: { seconds: 178, help: 1 } },
  { id: 'P02', DI: { seconds: 270, help: 0 }, TB: { seconds: 253, help: 0 }, CP: { seconds: 150, help: 0 } },
  { id: 'P03', DI: { seconds: 324, help: 2 }, TB: { seconds: 242, help: 0 }, CP: { seconds: 90, help: 0 } },
  { id: 'P04', DI: { seconds: 340, help: 4 }, TB: { seconds: 100, help: 2 }, CP: { seconds: 150, help: 0 } },
  { id: 'P05', DI: { seconds: 546, help: 2 }, TB: { seconds: 241, help: 1 }, CP: { seconds: 290, help: 0 } },
  { id: 'P06', DI: { seconds: 450, help: 4 }, TB: { seconds: 247, help: 1 }, CP: { seconds: 248, help: 0 } },
  { id: 'P07', DI: { seconds: 903, help: 6 }, TB: { seconds: 252, help: 0 }, CP: { seconds: 265, help: 1 } },
  { id: 'P08', DI: { seconds: 327, help: 0 }, TB: { seconds: 202, help: 0 }, CP: { seconds: 185, help: 0 } },
  { id: 'P09', DI: { seconds: 291, help: 1 }, TB: { seconds: 216, help: 1 }, CP: { seconds: 372, help: 1 } },
  { id: 'P10', DI: { seconds: 507, help: 4 }, TB: { seconds: 253, help: 1 }, CP: { seconds: 324, help: 2 } },
  { id: 'P11', DI: { seconds: 580, help: 4 }, TB: { seconds: 144, help: 1 }, CP: { seconds: 192, help: 2 } },
  { id: 'P12', DI: { seconds: 507, help: 3 }, TB: { seconds: 253, help: 0 }, CP: { seconds: 324, help: 0 } },
]

const systems = [
  { key: 'DI', label: 'Data Illustrator', y: 77.7 },
  { key: 'TB', label: 'Tableau', y: 162.4 },
  { key: 'CP', label: 'Our system', y: 247.1 },
]

const colors = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b',
  '#e377c2', '#7f7f7f', '#bcbd22', '#17becf', '#1f77b4', '#ff7f0e',
]

const width = 547.2
const height = 338.4
const plot = { left: 125.856, right: 536.256, top: 40.608, bottom: 284.256 }
const dataLeft = 144.510545
const dataRight = 517.601455
const outputDir = join(dirname(fileURLToPath(import.meta.url)), 'figs')

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return (sorted[middle - 1] + sorted[middle]) / 2
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function xScale(value, domainMax) {
  return dataLeft + (value / domainMax) * (dataRight - dataLeft)
}

function fixedTieOffsets(systemKey) {
  const grouped = new Map()
  for (const participant of participants) {
    const value = participant[systemKey].help
    const group = grouped.get(value) ?? []
    group.push(participant.id)
    grouped.set(value, group)
  }

  const offsets = new Map()
  const spacing = 6
  for (const ids of grouped.values()) {
    const center = (ids.length - 1) / 2
    ids.forEach((id, index) => offsets.set(id, (index - center) * spacing))
  }
  return offsets
}

function svgText(x, y, content, attributes = '') {
  return `<text x="${x}" y="${y}" ${attributes}>${content}</text>`
}

function renderPlot({ metric, title, xLabel, domainMax, ticks, note, jitterTies }) {
  const isTime = metric === 'seconds'
  const tieOffsets = Object.fromEntries(
    systems.map((system) => [system.key, jitterTies ? fixedTieOffsets(system.key) : new Map()]),
  )

  const point = (participant, system) => {
    const raw = participant[system.key][metric]
    const value = isTime ? raw / 60 : raw
    return {
      x: xScale(value, domainMax),
      y: system.y + (tieOffsets[system.key].get(participant.id) ?? 0),
      raw,
    }
  }

  const grid = ticks.map((tick) => {
    const x = xScale(tick, domainMax)
    return `
    <line x1="${x.toFixed(3)}" y1="${plot.top}" x2="${x.toFixed(3)}" y2="${plot.bottom}" class="grid"/>
    <line x1="${x.toFixed(3)}" y1="${plot.bottom}" x2="${x.toFixed(3)}" y2="${plot.bottom + 3.5}" class="tick"/>
    ${svgText(x.toFixed(3), 298.854, tick, 'class="tick-label" text-anchor="middle"')}`
  }).join('')

  const connectors = participants.map((participant, index) => {
    const points = systems.map((system) => point(participant, system))
    const coordinates = points.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ')
    const values = systems.map((system, systemIndex) => {
      const raw = points[systemIndex].raw
      return `${system.label}: ${isTime ? formatTime(raw) : raw}`
    }).join('; ')
    return `
    <polyline points="${coordinates}" fill="none" stroke="${colors[index]}" class="participant-line">
      <title>${participant.id} — ${values}</title>
    </polyline>`
  }).join('')

  const points = participants.flatMap((participant, index) => systems.map((system) => {
    const position = point(participant, system)
    const displayValue = isTime ? formatTime(position.raw) : String(position.raw)
    return `
    <circle cx="${position.x.toFixed(3)}" cy="${position.y.toFixed(3)}" r="2.45" fill="${colors[index]}" class="participant-point">
      <title>${participant.id} · ${system.label} · ${displayValue}${isTime ? '' : ' assistance instances'}</title>
    </circle>`
  })).join('')

  const summaries = systems.map((system) => {
    const values = participants.map((participant) => participant[system.key][metric])
    const rawMedian = median(values)
    const rawMean = mean(values)
    const scaledMedian = isTime ? rawMedian / 60 : rawMedian
    const scaledMean = isTime ? rawMean / 60 : rawMean
    const medianX = xScale(scaledMedian, domainMax)
    const meanX = xScale(scaledMean, domainMax)
    const medianY = system.y - 4
    const meanY = system.y + 4
    const medianLabel = isTime ? formatTime(rawMedian) : String(rawMedian)
    const meanLabel = isTime ? formatTime(Math.round(rawMean)) : rawMean.toFixed(2)
    return `
    <path d="M ${medianX.toFixed(3)} ${(medianY - 5.25).toFixed(3)} L ${(medianX + 5.25).toFixed(3)} ${medianY.toFixed(3)} L ${medianX.toFixed(3)} ${(medianY + 5.25).toFixed(3)} L ${(medianX - 5.25).toFixed(3)} ${medianY.toFixed(3)} Z" class="median">
      <title>${system.label} median: ${medianLabel}</title>
    </path>
    <rect x="${(meanX - 4.1).toFixed(3)}" y="${(meanY - 4.1).toFixed(3)}" width="8.2" height="8.2" class="mean">
      <title>${system.label} mean: ${meanLabel}</title>
    </rect>`
  }).join('')

  const yLabels = systems.map((system) => `
    <line x1="${plot.left - 3.5}" y1="${system.y}" x2="${plot.left}" y2="${system.y}" class="tick"/>
    ${svgText(plot.left - 7, system.y + 3.8, system.label, 'class="system-label" text-anchor="end"')}`).join('')

  return `<?xml version="1.0" encoding="utf-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" width="547.2pt" height="338.4pt" viewBox="0 0 547.2 338.4" role="img" aria-labelledby="plot-title plot-description" version="1.1">
  <title id="plot-title">${title}</title>
  <desc id="plot-description">${note}</desc>
  <metadata>Generated from the participant records supplied on 2026-09-07.</metadata>
  <defs>
    <clipPath id="plot-clip"><rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}"/></clipPath>
    <style><![CDATA[
      text { font-family: "DejaVu Sans", "Bitstream Vera Sans", Arial, Helvetica, sans-serif; fill: #111111; }
      .grid { stroke: #b0b0b0; stroke-opacity: 0.22; stroke-width: 0.8; }
      .separator { stroke: #9ca3af; stroke-opacity: 0.42; stroke-width: 0.75; }
      .axis { stroke: #000000; stroke-width: 0.8; fill: none; }
      .tick { stroke: #000000; stroke-width: 0.8; }
      .tick-label, .system-label, .axis-label, .legend-label { font-size: 10px; }
      .figure-title { font-size: 12px; }
      .note { font-size: 8px; }
      .participant-line { stroke-opacity: 0.30; stroke-width: 0.9; }
      .participant-point { fill-opacity: 0.72; stroke-opacity: 0.82; stroke-width: 0.45; }
      .median { fill: #1f77b4; stroke: #1f77b4; }
      .mean { fill: #d95f02; stroke: #d95f02; }
    ]]></style>
  </defs>

  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <rect x="${plot.left}" y="${plot.top}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top}" fill="#ffffff"/>

  <g id="x-axis">${grid}
    <line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" class="axis"/>
    ${svgText((plot.left + plot.right) / 2, 312.533, xLabel, 'class="axis-label" text-anchor="middle"')}
  </g>

  <g id="y-axis">${yLabels}
    <line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" class="axis"/>
  </g>

  <g id="system-separators" clip-path="url(#plot-clip)">
    <line x1="${plot.left}" y1="120.05" x2="${plot.right}" y2="120.05" class="separator"/>
    <line x1="${plot.left}" y1="204.75" x2="${plot.right}" y2="204.75" class="separator"/>
  </g>

  <g id="paired-observations" clip-path="url(#plot-clip)">${connectors}${points}</g>
  <g id="summary-statistics" clip-path="url(#plot-clip)">${summaries}</g>

  ${svgText(plot.left, 28.608, title, 'class="figure-title" text-anchor="start"')}
  <g id="legend">
    <path d="M 414 265.307 L 419.244 270.551 L 414 275.795 L 408.756 270.551 Z" class="median"/>
    ${svgText(427, 273.176, 'Median', 'class="legend-label" text-anchor="start"')}
    <rect x="477.9" y="266.451" width="8.2" height="8.2" class="mean"/>
    ${svgText(494, 273.176, 'Mean', 'class="legend-label" text-anchor="start"')}
  </g>
  ${svgText(width / 2, 329.94, note, 'class="note" text-anchor="middle"')}
</svg>
`
}

const helpSvg = renderPlot({
  metric: 'help',
  title: 'Facilitator assistance by participant (n = 12)',
  xLabel: 'Facilitator assistance instances (lower is better)',
  domainMax: 6,
  ticks: [0, 1, 2, 3, 4, 5, 6],
  note: 'Lines connect participants; tied counts are vertically dodged; diamonds show medians and squares show means.',
  jitterTies: true,
})

const timeSvg = renderPlot({
  metric: 'seconds',
  title: 'Task completion time by participant (n = 12)',
  xLabel: 'Task completion time (minutes; lower is better)',
  domainMax: 16,
  ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16],
  note: 'Lines connect the same participant; diamonds show medians and squares show means.',
  jitterTies: false,
})

writeFileSync(join(outputDir, 'participant_help_paired_dot_plot.svg'), helpSvg)
writeFileSync(join(outputDir, 'participant_time_paired_dot_plot.svg'), timeSvg)
