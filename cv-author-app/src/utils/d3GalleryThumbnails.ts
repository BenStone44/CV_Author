import type { SvgCandidate } from "../types";

const thumbnailHashes: Record<string, string> = {
  LineGraph: "12f99b59b32cf0794534d7a4e3f8c86c4a6b25428e135db9e17133bff935a995",
  MultiLineChart: "b0d4966110427b06bfdf7a84396cce6267e52cabf0805ba466618f2758cb56b5",
  ParallelCoordinatesPlot: "137c531fbab68c35e4713548f23b720c511234954380d23d9396c48a83e03d2d",
  AreaChart: "621c926e03757f3473aa2d0257e7eb0666ee01b22c73a658ce7357fea1d91afe",
  StackedAreaChart: "718ec24be1b77d9130e3e18f7e922ff092ae634d515924d1cf97b507e26de0dd",
  Streamgraph: "b33be4bd1cdafc454f4c2665ce9d4ef6d97aa1bbd42e7297913af3a5cd5b0b26",
  HorizonChart: "4674f92f3076649b97b5f833d80ae43df494be11370d79cf15d9a051685c197c",
  SingleBarChart: "0e8f394a9b90622bf4b422d264f3a199a0d9ec3a4c414b2e6f33788681cc486f",
  GroupedBarChart: "b37c165ba0794636e10d79e6126d469dfd7182f50cd01b70b8208c4457eedfc3",
  StackedBarChart: "d913303efcf3c716d98c7b4c3c32a5f56ca4cb8a07faaf5ce2b26b1ec7890e97",
  DivergentBarChart: "774026a8d6b737d6411e576b1ff1c46c2f928afd1e21ac6786c9d65f4dd83979",
  DivergentStackedBarChart: "6d30eda49a7bfd8b63019064257600a812ad4443f13becd3719db16a467de722",
  Calendar: "d008c0aeb2e945aef84b41961dd335bf81d9e01aed81b0f3c14ee782683ebbe9",
  Scatterplot: "9c4990bd174ca8781013b045fadb3b7c13e7f9e5540480eb20ceaa44d00b1bed",
  PieChart: "bc1e43c4dc01a4d7bc462ecd6cca55d096138f86406fc54be2a7674d0e733c57",
  DonutChart: "6ba65a23ffa3326d3679a66e6b1a9a17af61a1512d1f17258695fe5decfa6039",
  Boxplot: "bd4c5d003300d7c20d0a3af1055085deb043bbd2505c20acc1f95332f0591164",
  Contour: "500cadff2bd8b83135b5189668297c7f1c179900347911330660b2b83e9e9c39",
  Hexbin: "7c9f5bd32119c0575b9db52adc8f859c07891367f29ed5f463ad878602af67cf",
  Icicle: "6800ea153fbc5efdde82ed342b0ce8abfc6a7ebbb70b60944a084c790b6fea42",
  Sunburst: "5d33e22bc8da09a4495d5bfe0ff207610f2249dc33cbb98505058a4960e8d668",
  Treemap: "278516556172557a945111e81e0996b1e461364bc1402c57e412a33597d2f014",
  Dendrogram: "87ade408aa70f0875bf4b158dd986350d931884d5b6717cd7fc9b5d2680904c8",
  Chord: "204ffe6e4ebe39ce037c2caa5ac3c22bd630ea6dea19989833afa4d9c7531445",
  Sankey: "3074afcf13f0dfa574415acc4e293ba58d6da310e2f1a6d68aff493b9607ba1b",
};

export function d3GalleryThumbnailUrl(chartType: string) {
  const hash = thumbnailHashes[chartType];
  return hash ? `https://static.observableusercontent.com/thumbnail/${hash}.jpg` : null;
}

export function d3GalleryPlaceholderSvg(chartType: string) {
  const src = d3GalleryThumbnailUrl(chartType);
  if (!src) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><image href="${src}" x="0" y="0" width="320" height="200" preserveAspectRatio="xMidYMid slice"/></svg>`;
}

export function withD3GalleryThumbnail(candidate: SvgCandidate): SvgCandidate {
  const src = d3GalleryThumbnailUrl(candidate.chartType);
  const svgMarkup = d3GalleryPlaceholderSvg(candidate.chartType);
  return src && svgMarkup ? { ...candidate, src, svgMarkup } : candidate;
}
