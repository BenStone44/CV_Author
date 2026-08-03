// The curated subset displayed by CV Author. Source assets live in VisAnatomy.
const selectedChartNumbers = {
  AreaChart: [1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 18, 19, 20, 21, 27, 28],
  BarChart: [2, 3, 5, 6, 7, 10, 12, 13, 14, 19, 22, 27],
  BarChartInRadialLayout: [1, 2, 3, 6, 7, 8, 9, 10, 11],
  BoxAndWhisker: [1, 2, 4, 5, 6, 9, 12, 14, 15, 17, 22],
  BubbleChart: [2, 8, 10, 13],
  BulletChart: [3, 4, 5, 7, 8, 9, 11, 12, 16, 17, 18, 20],
  BumpChart: [2, 3, 4, 5, 6, 8, 9, 10, 14, 15, 17, 18, 19, 20, 21],
  Calendar: [6, 8, 12, 13, 16, 17, 20],
  CandlestickChart: [1, 3, 4, 5, 6, 7, 8, 11, 13, 14, 16, 17],
  CirclePacking: [1, 5, 7, 12, 13, 17],
  ConnectedDotPlot: [1, 2, 4, 5, 6, 14, 15, 19],
  ConnectedScatterPlot: [1, 3, 4, 13, 17, 18, 19, 21],
  DensityPlot: [2, 5, 7, 9],
  DivergingStackedBarChart: [1, 3, 5, 6, 9, 10, 12, 13, 15, 17, 18, 21],
  DonutChart: [3, 4, 9, 11, 12, 13, 14, 19],
  DotPlot: [2, 3, 7, 8, 10, 12, 14, 15, 18],
  GanttChart: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22],
  GeoHeatmap: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20],
  GroupedBarChart: [3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27],
  Heatmap: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, 25],
  KagiChart: [1, 6, 7, 8, 9, 10, 11, 12, 16],
  LineGraph: [8, 12, 13, 15, 17, 24, 27, 28, 34],
  MarimekkoChart: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21],
  MatrixDiagram: [4, 6, 7, 8, 9, 10, 12, 17, 18, 19, 21],
  ParallelCoordinatesPlot: [2, 5, 8, 9, 12, 15, 17, 20],
  PieChart: [3, 14, 21],
  PolarAreaChart: [1, 3, 4, 7, 10, 11, 13, 14, 17, 18, 19],
  RadarChart: [4, 12, 13, 14, 16],
  RadialBarChart: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  RangeChart: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19],
  Scatterplot: [1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 17, 18, 20, 22, 24, 30],
  SpiralPlot: [1, 2, 3, 4, 6, 10, 11, 12, 14, 15, 18, 19, 20],
  StackedAreaChart: [2, 4, 5, 8, 9, 10, 11, 12, 13, 15, 22, 23],
  StackedBarChart: [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  StreamGraph: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21],
  Treemap: [1, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 17, 18, 19, 20, 21],
  ViolinPlot: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21],
  WaffleChart: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22],
  WaterfallChart: [2, 5, 7, 8, 9, 10, 11, 12, 15, 16, 17, 18],
  WordCloud: [1, 2, 3, 6, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20],
} as const;

export const selectedChartNames = Object.entries(selectedChartNumbers).flatMap(
  ([chartType, numbers]) =>
    numbers.map((number) => {
      const name = `${chartType}${number}`;
      // This is the filename casing used by the upstream VisAnatomy dataset.
      return name === "ConnectedDotPlot19" ? "ConnectedDotplot19" : name;
    }),
);
