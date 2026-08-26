#!/usr/bin/env python3
"""Extract an HTML table from a text file and write it as CSV."""

from __future__ import annotations

import argparse
import csv
from html.parser import HTMLParser
from pathlib import Path


class TableParser(HTMLParser):
    def __init__(self, table_id: str) -> None:
        super().__init__(convert_charrefs=True)
        self.table_id = table_id
        self.in_target_table = False
        self.in_cell = False
        self.cell_parts: list[str] = []
        self.current_row: list[str] = []
        self.rows: list[list[str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attributes = dict(attrs)
        if tag == "table" and attributes.get("id") == self.table_id:
            self.in_target_table = True
        elif self.in_target_table and tag == "tr":
            self.current_row = []
        elif self.in_target_table and tag in {"th", "td"}:
            self.in_cell = True
            self.cell_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.in_target_table and self.in_cell and tag in {"th", "td"}:
            self.current_row.append("".join(self.cell_parts).strip())
            self.cell_parts = []
            self.in_cell = False
        elif self.in_target_table and tag == "tr":
            if self.current_row:
                self.rows.append(self.current_row)
            self.current_row = []
        elif self.in_target_table and tag == "table":
            self.in_target_table = False


def parse_args() -> argparse.Namespace:
    repository_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "input",
        nargs="?",
        type=Path,
        default=repository_root / "data" / "m.txt",
        help="HTML text file (default: data/m.txt)",
    )
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        default=repository_root / "data" / "case3.csv",
        help="CSV output file (default: data/case3.csv)",
    )
    parser.add_argument(
        "--table-id",
        default="dataTable",
        help="ID of the table to extract (default: dataTable)",
    )
    return parser.parse_args()


def extract_table(input_path: Path, table_id: str) -> list[list[str]]:
    parser = TableParser(table_id)
    parser.feed(input_path.read_text(encoding="utf-8"))
    parser.close()

    if not parser.rows:
        raise ValueError(f"No table with id {table_id!r} found in {input_path}")

    column_count = len(parser.rows[0])
    malformed_rows = [
        index
        for index, row in enumerate(parser.rows[1:], start=2)
        if len(row) != column_count
    ]
    if malformed_rows:
        row_list = ", ".join(map(str, malformed_rows[:10]))
        raise ValueError(
            f"Rows with unexpected column counts: {row_list} "
            f"(expected {column_count} columns)"
        )

    return parser.rows


def main() -> None:
    args = parse_args()
    rows = extract_table(args.input, args.table_id)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as output_file:
        csv.writer(output_file).writerows(rows)

    print(
        f"Wrote {len(rows) - 1} data rows and {len(rows[0])} columns "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
