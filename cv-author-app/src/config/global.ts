/**
 * Application-wide chart palette configuration.
 *
 * `categorical` is for distinguishing discrete series or groups.
 * `gradient` is ordered from the low end to the high end of a continuous scale.
 * Edit these two arrays to customize all chart colors.
 */
export const globalPalette = {
  categorical: [
    "#606c38",
    "#283618",
    "#ffe6a7",
    "#dda15e",
    "#bc6c25",
    "#780000",
    "#c1121f",
    "#003049",
    "#669bbc",
  ],
  gradient: [
    "#ffedd8",
    "#f3d5b5",
    "#e7bc91",
    "#d4a276",
    "#bc8a5f",
    "#a47148",
    "#8b5e34",
    "#6f4518",
    "#603808",
    "#583101",

  ],
};

/** Colors exposed by frontend appearance controls. */
export const frontendPalette = [
  "#432818",
  "#99582a",
  "#ffe6a7",
  "#bb9457",
] as const;
