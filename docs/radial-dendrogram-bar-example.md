# Radial dendrogram with outer bars

The hierarchy layout follows the D3 [Radial cluster tree](https://observablehq.com/@d3/radial-cluster/2): `cluster().size([2 * PI, radius])`, depth-aware sibling separation, radial links, and rotated node labels.

Import `data/radial_dendrogram_bars.csv` and create the two Polar templates with these bindings:

| Template | Channel | Field |
| --- | --- | --- |
| Radial Dendrogram | Node ID | `node_id` |
| Radial Dendrogram | Parent ID | `parent_id` |
| Radial Dendrogram | Leaf order | `leaf_id` |
| Radial Bar Chart | Node ID | `node_id` |
| Radial Bar Chart | Parent ID | `parent_id` |
| Radial Bar Chart | Leaf | `leaf_id` |
| Radial Bar Chart | Value | `value` |
| Radial Bar Chart | Color | `group` |

Rows with an empty `leaf_id` are internal hierarchy nodes. Rows with a `leaf_id` are leaves and contain one numeric `value`, so every dendrogram leaf has exactly one radial bar.

Place the Radial Bar Chart outside the Radial Dendrogram with radial concat. Both templates use the same D3 radial-cluster layout and expose `leaf_id` through the shared angle channel, so each bar center uses the exact angle of its hierarchy leaf. Keep the dendrogram as the inner member and the bars as the outer member.
