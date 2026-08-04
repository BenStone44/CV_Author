import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const templateDirectory = resolve(scriptDirectory, "../templates/Linechart");
const csvPath = resolve(templateDirectory, "sample-data.csv");
const svgPath = resolve(templateDirectory, "rendered.svg");
const previewPath = resolve(templateDirectory, "preview.png");
const width = 640;
const height = 360;
const margin = { top: 28, right: 28, bottom: 54, left: 58 };
const colors = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed"];

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const csv = (await readFile(csvPath, "utf8")).trim().split(/\r?\n/);
const headers = csv.shift().split(",");
const rows = csv.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
const groups = new Map();
rows.forEach((row) => {
  const key = row.person;
  groups.set(key, [...(groups.get(key) ?? []), row]);
});

const dates = rows.map((row) => new Date(`${row.time}T00:00:00Z`).getTime());
const values = rows.map((row) => Number(row.weight_kg));
const minDate = Math.min(...dates);
const maxDate = Math.max(...dates);
const minValue = Math.floor(Math.min(...values) - 1);
const maxValue = Math.ceil(Math.max(...values) + 1);
const plotWidth = width - margin.left - margin.right;
const plotHeight = height - margin.top - margin.bottom;
const x = (date) => margin.left + ((date - minDate) / Math.max(maxDate - minDate, 1)) * plotWidth;
const y = (value) => margin.top + (1 - ((value - minValue) / Math.max(maxValue - minValue, 1))) * plotHeight;
const ticks = 5;

const grid = Array.from({ length: ticks }, (_, index) => {
  const value = minValue + ((maxValue - minValue) * index) / (ticks - 1);
  const py = y(value);
  return `<line x1="${margin.left}" x2="${width - margin.right}" y1="${py}" y2="${py}" stroke="#e2e8f0"/><text x="${margin.left - 10}" y="${py + 4}" text-anchor="end" fill="#64748b">${value.toFixed(0)}</text>`;
}).join("");

const series = [...groups.entries()].map(([person, personRows], index) => {
  const ordered = [...personRows].sort((left, right) => left.time.localeCompare(right.time));
  const points = ordered.map((row) => `${x(new Date(`${row.time}T00:00:00Z`).getTime()).toFixed(2)},${y(Number(row.weight_kg)).toFixed(2)}`).join(" ");
  const circles = ordered.map((row) => `<circle data-mark-role="point" data-person="${escapeXml(person)}" data-time="${row.time}" cx="${x(new Date(`${row.time}T00:00:00Z`).getTime()).toFixed(2)}" cy="${y(Number(row.weight_kg)).toFixed(2)}" r="3.5" fill="${colors[index]}"/>`).join("");
  return `<g data-mark-role="series" data-series-key="${escapeXml(person)}"><polyline points="${points}" fill="none" stroke="${colors[index]}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${circles}</g>`;
}).join("");

const xLabels = [...groups.values()][0].map((row) => {
  const px = x(new Date(`${row.time}T00:00:00Z`).getTime());
  return `<text x="${px}" y="${height - margin.bottom + 24}" text-anchor="middle" fill="#64748b">${row.time.slice(5)}</text>`;
}).join("");

const legend = [...groups.keys()].map((person, index) => {
  const legendX = margin.left + index * 104;
  return `<g transform="translate(${legendX} 15)"><line x1="0" x2="16" y1="0" y2="0" stroke="${colors[index]}" stroke-width="2.5"/><text x="22" y="4" fill="#334155">${escapeXml(person)}</text></g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Arial, sans-serif" font-size="11"><rect width="${width}" height="${height}" fill="#ffffff"/><text x="${margin.left}" y="${height - 12}" fill="#334155">time</text><text x="16" y="${margin.top + plotHeight / 2}" fill="#334155" transform="rotate(-90 16 ${margin.top + plotHeight / 2})">weight_kg</text>${grid}<line x1="${margin.left}" x2="${width - margin.right}" y1="${height - margin.bottom}" y2="${height - margin.bottom}" stroke="#64748b"/><line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${height - margin.bottom}" stroke="#64748b"/>${xLabels}${series}${legend}</svg>`;

await writeFile(svgPath, svg);
await sharp(Buffer.from(svg)).png().toFile(previewPath);
console.log(`Generated ${svgPath} and ${previewPath}.`);
