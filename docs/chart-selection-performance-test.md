# Chart Selection Performance Test

Use the Vite URL with one query parameter at a time. The app keeps its normal
selection behavior when no parameter is present.

## Isolated stages

Reload the page before each case, then click the same chart several times.

| URL parameter | Operation measured |
| --- | --- |
| `selection-stage=cleanup` | Runs all transient cleanup steps as one combined operation. |
| `selection-stage=transient` | Clears context-menu and drag/drop state. |
| `selection-stage=drilldown` | Clears a previous chart drilldown and semantic mark selection when the clicked chart differs. |
| `selection-stage=composition-edit` | Finishes an active composition edit when the clicked chart is outside it. |
| `selection-stage=scope` | Leaves the current group-edit scope when the clicked chart is outside it. |
| `selection-stage=normalize` | Resolves the clicked node into the current selection scope. |
| `selection-stage=move` | Creates the pointer-move interaction and installs pointer listeners. |
| `selection-stage=relationship` | Dispatches chart entity selection to the relationship store. |
| `selection-stage=selection` | Runs the normal selection setter (including its defensive normalization) and clears semantic mark selection. |
| `selection-stage=axis-binding` | Sets the chart's axis/encoding binding target. |
| `selection-stage=composition` | Sets the composition drag source state. |

For example:

```text
http://localhost:<vite-port>/?selection-stage=relationship
```

An isolated stage intentionally does not complete chart selection. This keeps
the click focused on one trigger and prevents later reactive work from hiding
the expensive operation.

## Full-path profile

Use this URL to preserve normal behavior while timing every stage:

```text
http://localhost:<vite-port>/?selection-profile=1
```

The `selection-stage=full` variant is equivalent and can be useful when a
script always supplies a stage parameter.

## Reading results

Each click writes `sync` entries to the browser console and to the log below.
In isolated stage mode, a second `flush` entry is recorded after Vue's next
render tick; that is the useful signal when the handler is fast but the UI
still freezes.

The log is available at:

```js
window.__CV_AUTHOR_SELECTION_LOG__
```

To clear previous clicks before a run:

```js
window.__CV_AUTHOR_SELECTION_LOG__.length = 0
```

To summarize a run by stage:

```js
Object.groupBy(window.__CV_AUTHOR_SELECTION_LOG__, (entry) => entry.stage)
```

Use `entry.phase` to distinguish synchronous handler work from the post-event
Vue flush.

Compare repeated clicks within the same stage first, then compare stages on
the same chart and dataset. A slow isolated stage identifies the synchronous
work to inspect; a slow full profile with all isolated stages fast points to
Vue rendering or a watcher scheduled after the pointer handler.
