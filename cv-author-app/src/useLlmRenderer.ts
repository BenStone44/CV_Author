import { ref, toRaw } from "vue";
import type { CanvasNode, Dataset, GeneratedMarkMetadata, LlmRendererProvenance } from "./types";

type RendererResponse = {
  status: "ready";
  program: { code: string };
  provenance: LlmRendererProvenance;
};

type WorkerResult = { ok: true; result: { svg: string; marks: GeneratedMarkMetadata[] } } | { ok: false; error: string };

function buildSchema(dataset: Dataset) {
  return dataset.columns.map((column) => {
    const values = dataset.rows.map((row) => String(row[column.name] ?? ""));
    const nonEmpty = values.filter((value) => value.trim().length > 0);
    const examples = [...new Set(nonEmpty)].slice(0, 5);
    const summary: {
      name: string;
      type: typeof column.type;
      nullable: boolean;
      rowCount: number;
      nonEmptyCount: number;
      distinctCount: number;
      examples: string[];
      min?: number;
      max?: number;
      minValue?: string;
      maxValue?: string;
    } = {
      name: column.name,
      type: column.type,
      nullable: nonEmpty.length !== values.length,
      rowCount: values.length,
      nonEmptyCount: nonEmpty.length,
      distinctCount: new Set(nonEmpty).size,
      examples,
    };
    if (column.type === "quantitative") {
      const numbers = nonEmpty.map(Number).filter(Number.isFinite);
      if (numbers.length > 0) {
        summary.min = Math.min(...numbers);
        summary.max = Math.max(...numbers);
      }
    } else if (column.type === "temporal" && nonEmpty.length > 0) {
      const ordered = [...nonEmpty].sort();
      summary.minValue = ordered[0];
      summary.maxValue = ordered[ordered.length - 1];
    }
    return summary;
  });
}

export function useLlmRenderer() {
  const status = ref<"idle" | "loading" | "ready" | "error" | "cancelled">("idle");
  const error = ref("");
  const provenance = ref<LlmRendererProvenance | null>(null);
  let requestController: AbortController | null = null;
  let worker: Worker | null = null;

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }

  function cancel() {
    requestController?.abort();
    requestController = null;
    stopWorker();
    if (status.value === "loading") status.value = "cancelled";
  }

  async function execute(node: CanvasNode, dataset: Dataset) {
    if (!node.chartSpec) throw new Error("Select a chart with a chart specification first.");
    if (!node.chartSpec.encodings.x || !node.chartSpec.encodings.y) throw new Error("Bind both x and y columns before generating D3 code.");
    cancel();
    status.value = "loading";
    error.value = "";
    const schema = buildSchema(dataset);
    const controller = new AbortController();
    requestController = controller;
    try {
      const response = await fetch("/api/llm/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          input: {
            width: node.width,
            height: node.height,
            svg: node.renderedContent ?? (node.kind === "leaf" ? node.content : ""),
            xColumn: node.chartSpec.encodings.x?.field,
            yColumn: node.chartSpec.encodings.y?.field,
            schema,
            chartSpec: node.chartSpec,
          },
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error ?? `Renderer API returned HTTP ${response.status}.`);
      const payload = body as RendererResponse;
      provenance.value = payload.provenance;
      const result = await runWorker(payload.program.code, dataset, node);
      if (!result.ok) throw new Error(result.error);
      status.value = "ready";
      return { ...result.result, code: payload.program.code, provenance: payload.provenance };
    } catch (cause) {
      if (controller.signal.aborted) {
        if (requestController === controller) status.value = "cancelled";
        throw new DOMException("Renderer request was cancelled.", "AbortError");
      }
      if (requestController === controller) {
        status.value = "error";
        error.value = cause instanceof Error ? cause.message : "Unable to generate renderer.";
      }
      throw cause;
    } finally {
      if (requestController === controller) {
        requestController = null;
        stopWorker();
      }
    }
  }

  function runWorker(code: string, dataset: Dataset, node: CanvasNode) {
    return new Promise<WorkerResult>((resolve, reject) => {
      worker = new Worker(new URL("./llmRenderer.worker.ts", import.meta.url), { type: "module" });
      const timeout = window.setTimeout(() => {
        stopWorker();
        reject(new Error("Renderer execution timed out."));
      }, 4_000);
      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Renderer worker failed."));
      };
      const plainData = JSON.parse(JSON.stringify(toRaw(dataset.rows))) as Record<string, string>[];
      const plainChartSpec = node.chartSpec
        ? JSON.parse(JSON.stringify(toRaw(node.chartSpec)))
        : undefined;
      worker.postMessage({ code, data: plainData, width: node.width, height: node.height, chartSpec: plainChartSpec });
    });
  }

  return { status, error, provenance, execute, cancel };
}
