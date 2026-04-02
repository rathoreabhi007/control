#!/usr/bin/env python3
"""Populate a Parquet dataset with random business dates over a lookback window."""

from __future__ import annotations

import argparse
import calendar
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd


def subtract_months(base_date: date, months: int) -> date:
    month = base_date.month - months
    year = base_date.year
    while month <= 0:
        month += 12
        year -= 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def random_business_dates(count: int, start: date, end: date) -> pd.Series:
    if count <= 0:
        return pd.Series(dtype="datetime64[ns]")
    span_days = (end - start).days
    if span_days < 0:
        raise ValueError("End date must be after start date.")
    offsets = np.random.randint(0, span_days + 1, size=count)
    start_ts = pd.Timestamp(start)
    return start_ts + pd.to_timedelta(offsets, unit="d")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Add or replace a BusinessDate column with random dates in the past N months."
    )
    parser.add_argument(
        "path",
        type=Path,
        nargs="?",
        default=Path(r"D:\office\rag_app\controldash\dummy_controls_data.parquet"),
        help="Path to the Parquet file to update.",
    )
    parser.add_argument(
        "-m",
        "--months-back",
        type=int,
        default=5,
        help="How many months back from today the random range should include.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Optional output path; defaults to overwriting the input file.",
    )
    parser.add_argument(
        "-s",
        "--seed",
        type=int,
        help="Optional random seed to make the generated dates deterministic.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_path = args.path
    if not source_path.exists():
        raise SystemExit(f"Input file not found: {source_path}")

    df = pd.read_parquet(source_path)
    if args.seed is not None:
        np.random.seed(args.seed)

    today = date.today()
    window_start = subtract_months(today, args.months_back)
    df["BusinessDate"] = random_business_dates(len(df), window_start, today)

    output_path = args.output or source_path
    df.to_parquet(output_path, index=False)

    print(
        f"Filled {len(df)} rows with BusinessDate randomly drawn between "
        f"{window_start.isoformat()} and {today.isoformat()}. "
        f"Written to {output_path.resolve()}."
    )


if __name__ == "__main__":
    main()
