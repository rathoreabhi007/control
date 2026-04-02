"""
Subprocess worker for supervisory aggregations.
Reads JSON from stdin and writes JSON to stdout.
"""

from __future__ import annotations

import json
import re
import traceback
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import polars as pl
import pyarrow.parquet as pq


FILTER_COLUMNS = {
    "regulation": "Regulation",
    "asset_class": "AssetClass",
    "control_type": "Control Type",
    "data_type": "Data Type",
    "sub_control_type": "Sub-ControlType",
    "remediation_status": "RemediationStatus",
    "explain_issue": "ExplainIssue",
    "explain_issue_notification": "ExplainIssueNotification",
    "explain_issue_detail": "ExplainIssueDetail",
}

AGE_BUCKETS_BY_SET = {
    "CFTC": ["0-3", "3-7", "7-14", "14-30", "30-60"],
    "EMIR": ["0-2", "3-10", "11-30", "31-50"],
}
DEFAULT_BUCKET_SET = "CFTC"
AGE_BUCKET_COLUMNS = AGE_BUCKETS_BY_SET["CFTC"]
DEFAULT_INITIAL_FILTERS = {
    "regulation": ["CFTC-P45"],
    "asset_class": ["FX"],
    "data_type": ["TRADESTATE"],
}

DISPLAY_LABELS = {
    "Regulation": "Regulation",
    "AssetClass": "Asset Class",
    "Control Type": "Control Type",
    "Data Type": "Data Type",
    "Sub-ControlType": "Sub-Control Type",
    "RemediationPlan": "Remediation Plan",
    "RemediationStatus": "Remediation Status",
    "ExplainIssue": "ExplainIssue",
    "ExplainIssueNotification": "ExplainIssueNotification",
    "ExplainIssueDetail": "ExplainIssueDetail",
}

AGE_BUCKET_SET_COLUMN_CANDIDATES = {
    "CFTC": {
        "0-3": ["0-3", "CFTC_0-3", "0-3_CFTC", "CFTC_0_3", "0_3_CFTC"],
        "3-7": ["3-7", "CFTC_3-7", "3-7_CFTC", "CFTC_3_7", "3_7_CFTC"],
        "7-14": ["7-14", "CFTC_7-14", "7-14_CFTC", "CFTC_7_14", "7_14_CFTC"],
        "14-30": ["14-30", "CFTC_14-30", "14-30_CFTC", "CFTC_14_30", "14_30_CFTC"],
        "30-60": ["30-60", "CFTC_30-60", "30-60_CFTC", "CFTC_30_60", "30_60_CFTC"],
    },
    "EMIR": {
        "0-2": ["0-2", "EMIR_0-2", "0-2_EMIR", "EMIR_0_2", "0_2_EMIR"],
        "3-10": ["3-10", "EMIR_3-10", "3-10_EMIR", "EMIR_3_10", "3_10_EMIR"],
        "11-30": ["11-30", "EMIR_11-30", "11-30_EMIR", "EMIR_11_30", "11_30_EMIR"],
        "31-50": ["31-50", "EMIR_31-50", "31-50_EMIR", "EMIR_31_50", "31_50_EMIR"],
    },
}


def ensure_remediation_status(lazy_df: pl.LazyFrame) -> pl.LazyFrame:
    schema = lazy_df.collect_schema()
    if "RemediationStatus" in schema:
        return lazy_df
    if "RemediationPlan" not in schema:
        raise ValueError("Missing required column: RemediationPlan")
    return lazy_df.with_columns(
        [
            pl.when(pl.col("RemediationPlan") == "No action required")
            .then(pl.lit("Remediated"))
            .otherwise(pl.lit("Unremediated"))
            .alias("RemediationStatus")
        ]
    )


def ensure_age_buckets(lazy_df: pl.LazyFrame, bucket_set: str = DEFAULT_BUCKET_SET) -> pl.LazyFrame:
    schema = lazy_df.collect_schema()
    if "ErrorAge" not in schema:
        raise ValueError("Missing required column: ErrorAge")

    selected_set = (bucket_set or DEFAULT_BUCKET_SET).upper()
    age_col = pl.col("ErrorAge")
    if selected_set == "EMIR":
        expressions = [
            (age_col <= 2).cast(pl.Int64).alias("0-2"),
            ((age_col > 2) & (age_col <= 10)).cast(pl.Int64).alias("3-10"),
            ((age_col > 10) & (age_col <= 30)).cast(pl.Int64).alias("11-30"),
            ((age_col > 30) & (age_col <= 50)).cast(pl.Int64).alias("31-50"),
        ]
        return lazy_df.with_columns(expressions)

    expressions = [
        (age_col <= 3).cast(pl.Int64).alias("0-3"),
        ((age_col > 3) & (age_col <= 7)).cast(pl.Int64).alias("3-7"),
        ((age_col > 7) & (age_col <= 14)).cast(pl.Int64).alias("7-14"),
        ((age_col > 14) & (age_col <= 30)).cast(pl.Int64).alias("14-30"),
        ((age_col > 30) & (age_col <= 60)).cast(pl.Int64).alias("30-60"),
    ]
    return lazy_df.with_columns(expressions)


def resolve_age_bucket_column_map(schema_names: set, bucket_set: str) -> Optional[Dict[str, str]]:
    candidates = AGE_BUCKET_SET_COLUMN_CANDIDATES.get(bucket_set, {})
    bucket_columns = AGE_BUCKETS_BY_SET.get(bucket_set, AGE_BUCKET_COLUMNS)
    column_map: Dict[str, str] = {}
    for bucket in bucket_columns:
        physical = next((name for name in candidates.get(bucket, []) if name in schema_names), None)
        if not physical:
            return None
        column_map[bucket] = physical
    return column_map


def get_available_bucket_sets(schema_names: set) -> List[str]:
    available: List[str] = []
    for bucket_set in AGE_BUCKETS_BY_SET.keys():
        if resolve_age_bucket_column_map(schema_names, bucket_set):
            available.append(bucket_set)
    schema_lower = {name.lower() for name in schema_names}
    if "errorage" in schema_lower:
        for bucket_set in AGE_BUCKETS_BY_SET.keys():
            if bucket_set not in available:
                available.append(bucket_set)
    return available


def apply_age_bucket_set(lazy_df: pl.LazyFrame, bucket_set: str) -> Tuple[pl.LazyFrame, str, List[str]]:
    schema = lazy_df.collect_schema()
    schema_names = set(schema.names())
    normalized_set = (bucket_set or DEFAULT_BUCKET_SET).upper()
    available_sets = get_available_bucket_sets(schema_names)

    selected_set = normalized_set if normalized_set in available_sets else DEFAULT_BUCKET_SET
    if selected_set not in available_sets and available_sets:
        selected_set = available_sets[0]

    selected_buckets = AGE_BUCKETS_BY_SET.get(selected_set, AGE_BUCKET_COLUMNS)
    column_map = resolve_age_bucket_column_map(schema_names, selected_set)
    if column_map:
        return (
            lazy_df.with_columns([pl.col(column_map[b]).alias(b) for b in selected_buckets]),
            selected_set,
            selected_buckets,
        )

    schema_lower = {name.lower() for name in schema_names}
    if "errorage" in schema_lower:
        error_age_col_name = next((name for name in schema_names if name.lower() == "errorage"), "ErrorAge")
        if error_age_col_name != "ErrorAge":
            lazy_df = lazy_df.with_columns(pl.col(error_age_col_name).alias("ErrorAge"))
        return ensure_age_buckets(lazy_df, selected_set), selected_set, selected_buckets

    raise ValueError(f"No age bucket columns available for set: {bucket_set} (Available: {available_sets})")


def get_default_initial_filters(filter_options: Dict[str, List[str]]) -> Dict[str, List[str]]:
    defaults: Dict[str, List[str]] = {}
    for key, configured_values in DEFAULT_INITIAL_FILTERS.items():
        available_values = set(filter_options.get(key, []))
        defaults[key] = [v for v in configured_values if v in available_values]
    return defaults


def slugify(value: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "_", str(value).strip().lower())
    return text.strip("_") or "value"


def ensure_business_date(lazy_df: pl.LazyFrame) -> pl.LazyFrame:
    schema_names = set(lazy_df.collect_schema().names())
    business_date_col = next((name for name in schema_names if name.lower() == "businessdate"), None)
    if not business_date_col:
        business_date_col = next((name for name in schema_names if name.lower() == "businessdatefast5months"), None)
    if not business_date_col:
        raise ValueError("Missing required date column: BusinessDate or BusinessDateFast5Months")

    return lazy_df.with_columns(
        [
            pl.col(business_date_col).cast(pl.Datetime, strict=False).alias("_business_ts"),
        ]
    ).with_columns(
        [
            pl.col("_business_ts").dt.date().alias("_business_date"),
        ]
    )


def add_months(month_start: date, months: int) -> date:
    year = month_start.year + ((month_start.month - 1 + months) // 12)
    month = ((month_start.month - 1 + months) % 12) + 1
    return date(year, month, 1)


def first_day_of_month(value: date) -> date:
    return value.replace(day=1)


def build_month_windows(max_date: date, count: int) -> List[date]:
    start = add_months(first_day_of_month(max_date), -(count - 1))
    return [add_months(start, offset) for offset in range(count)]


def build_day_windows(start_date: date, end_date: date) -> List[date]:
    total_days = (end_date - start_date).days
    return [start_date + timedelta(days=offset) for offset in range(total_days + 1)]


def build_status_table(
    counts: List[Dict[str, Any]],
    periods: List[date],
    statuses: List[str],
    key_fn,
    label_fn,
) -> List[Dict[str, Any]]:
    count_map = {
        (row["period_key"], row["RemediationStatus"]): int(row["count"] or 0)
        for row in counts
    }
    rows: List[Dict[str, Any]] = []
    for period in periods:
        period_key = key_fn(period)
        status_counts = {status: count_map.get((period_key, status), 0) for status in statuses}
        rows.append(
            {
                "period_key": period_key,
                "period_label": label_fn(period),
                "total_count": sum(status_counts.values()),
                "status_counts": status_counts,
            }
        )
    return rows


def build_stacked_chart(
    counts: List[Dict[str, Any]],
    periods: List[date],
    statuses: List[str],
    plans: List[str],
    key_fn,
    label_fn,
) -> Dict[str, Any]:
    series = [
        {
            "key": f"plan__{slugify(plan)}",
            "label": plan,
            "plan": plan,
            "stack_id": "plans",
        }
        for plan in plans
    ]
    series_key_map = {item["plan"]: item["key"] for item in series}

    row_order: List[str] = []
    rows_by_period: Dict[str, Dict[str, Any]] = {}
    for period in periods:
        period_key = key_fn(period)
        period_label = label_fn(period)
        for status in statuses:
            status_slug = slugify(status)
            row_key = f"{period_key}__{status_slug}"
            row_order.append(row_key)
            row = {
                "row_key": row_key,
                "period_key": period_key,
                "period_label": period_label,
                "status": status,
                "chart_label": f"{status}||{period_label}",
                "total_count": 0,
            }
            for item in series:
                row[item["key"]] = 0
            rows_by_period[row_key] = row

    for count_row in counts:
        period_key = count_row["period_key"]
        plan = str(count_row["RemediationPlan"])
        status = str(count_row["RemediationStatus"])
        count_value = int(count_row["count"] or 0)
        row_key = f"{period_key}__{slugify(status)}"
        row = rows_by_period.get(row_key)
        if not row:
            continue
        row["total_count"] += count_value
        series_key = series_key_map.get(plan)
        if series_key:
            row[series_key] += count_value

    line_options = [{"key": "total_count", "label": "Total Count"}]
    line_options.extend({"key": item["key"], "label": item["label"]} for item in series)

    return {
        "data": [rows_by_period[key] for key in row_order],
        "series": series,
        "line_options": line_options,
    }


def build_grouped_matrix_table(
    lazy_df: pl.LazyFrame,
    periods: List[date],
    statuses: List[str],
    group_by_columns: List[str],
    start_date: date,
    period_format: str,
    label_fn,
) -> Dict[str, Any]:
    base_df = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(start_date))
        .with_columns(pl.col("_business_date").dt.strftime(period_format).alias("period_key"))
    )

    aggregation_columns = [*group_by_columns, "period_key", "RemediationStatus"] if group_by_columns else ["period_key", "RemediationStatus"]
    counts = (
        base_df
        .group_by(aggregation_columns)
        .agg(pl.len().alias("count"))
        .sort(aggregation_columns)
        .collect(streaming=True)
        .to_dicts()
    )

    period_columns = []
    value_field_map: Dict[Tuple[str, str], str] = {}
    for period in periods:
        period_key = period.strftime(period_format)
        children = []
        for status in statuses:
            field_key = f"{period_key}__{slugify(status)}"
            value_field_map[(period_key, status)] = field_key
            children.append(
                {
                    "field": field_key,
                    "status": status,
                    "headerName": status,
                }
            )
        period_columns.append(
            {
                "period_key": period_key,
                "period_label": label_fn(period),
                "children": children,
            }
        )

    rows_by_group: Dict[Tuple[str, ...], Dict[str, Any]] = {}
    row_order: List[Tuple[str, ...]] = []
    for count_row in counts:
        group_key = tuple(str(count_row.get(column, "")) for column in group_by_columns) if group_by_columns else ("All Records",)
        if group_key not in rows_by_group:
            row = {column: value for column, value in zip(group_by_columns, group_key)}
            if not group_by_columns:
                row["Group"] = "All Records"
            for field_key in value_field_map.values():
                row[field_key] = 0
            row["row_total"] = 0
            rows_by_group[group_key] = row
            row_order.append(group_key)

        field_key = value_field_map[(count_row["period_key"], str(count_row["RemediationStatus"]))]
        count_value = int(count_row["count"] or 0)
        rows_by_group[group_key][field_key] += count_value
        rows_by_group[group_key]["row_total"] += count_value

    group_columns_payload = [
        {
            "field": column,
            "headerName": DISPLAY_LABELS.get(column, column),
        }
        for column in group_by_columns
    ] or [{"field": "Group", "headerName": "Group"}]

    return {
        "group_columns": group_columns_payload,
        "period_columns": period_columns,
        "rows": [rows_by_group[key] for key in row_order],
    }


def build_filter_options_result(file_path: str) -> Dict[str, Any]:
    lazy_df = pl.scan_parquet(file_path)
    lazy_df = ensure_remediation_status(lazy_df)
    schema_names = set(lazy_df.collect_schema().names())
    available_bucket_sets = get_available_bucket_sets(schema_names)
    default_bucket_set = DEFAULT_BUCKET_SET if DEFAULT_BUCKET_SET in available_bucket_sets else (
        available_bucket_sets[0] if available_bucket_sets else DEFAULT_BUCKET_SET
    )

    filter_options: Dict[str, List[str]] = {}
    for key, column_name in FILTER_COLUMNS.items():
        try:
            unique_values = (
                lazy_df
                .select(pl.col(column_name))
                .unique()
                .collect(streaming=True)
                .to_series()
                .to_list()
            )
            unique_values = sorted([v for v in unique_values if v is not None])
            filter_options[key] = unique_values
        except Exception:
            filter_options[key] = []

    parquet_file = pq.ParquetFile(file_path)
    total_rows = parquet_file.metadata.num_rows

    return {
        "success": True,
        "filter_options": filter_options,
        "default_initial_filters": get_default_initial_filters(filter_options),
        "bucket_sets": available_bucket_sets,
        "default_bucket_set": default_bucket_set,
        "total_records": total_rows,
        "columns": list(FILTER_COLUMNS.keys()),
        "age_buckets": AGE_BUCKETS_BY_SET.get(default_bucket_set, AGE_BUCKET_COLUMNS),
        "age_buckets_by_set": AGE_BUCKETS_BY_SET,
        "retrieved_at": datetime.now().isoformat(),
        "_debug_info": {
            "execution_mode": "subprocess",
        },
    }


def build_aggregation_result(file_path: str, request: Dict[str, Any]) -> Dict[str, Any]:
    lazy_df = pl.scan_parquet(file_path)
    lazy_df = ensure_remediation_status(lazy_df)
    lazy_df, active_bucket_set, active_age_buckets = apply_age_bucket_set(
        lazy_df, request.get("bucket_set", DEFAULT_BUCKET_SET)
    )

    parquet_file = pq.ParquetFile(file_path)
    total_records = parquet_file.metadata.num_rows

    filters = request.get("filters") or {}
    for filter_key, filter_values in filters.items():
        if filter_values:
            column_name = FILTER_COLUMNS.get(filter_key)
            if column_name:
                lazy_df = lazy_df.filter(pl.col(column_name).is_in(filter_values))

    group_by_columns: List[str] = []
    group_by = request.get("group_by")
    if group_by:
        for col in group_by:
            actual_col = FILTER_COLUMNS.get(str(col).lower().replace(" ", "_"), col)
            group_by_columns.append(actual_col)
    else:
        group_by_columns = ["Regulation", "AssetClass"]

    include_remediation_split = bool(request.get("include_remediation_split", True))

    if include_remediation_split:
        agg_expressions = [pl.count().alias("total_count")]
        for bucket in active_age_buckets:
            agg_expressions.append(pl.col(bucket).sum().alias(f"total_{bucket}"))
        for bucket in active_age_buckets:
            agg_expressions.append(
                pl.when(pl.col("RemediationStatus") == "Unremediated")
                .then(pl.col(bucket))
                .otherwise(0)
                .sum()
                .alias(f"unremediated_{bucket}")
            )
        agg_expressions.append(
            pl.when(pl.col("RemediationStatus") == "Unremediated")
            .then(1)
            .otherwise(0)
            .sum()
            .alias("unremediated_count")
        )

        aggregated_df = (
            lazy_df.group_by(group_by_columns).agg(agg_expressions).sort(group_by_columns).collect(streaming=True)
        )
        aggregations = aggregated_df.to_dicts()

        for row in aggregations:
            row["total_total"] = sum(row.get(f"total_{bucket}", 0) or 0 for bucket in active_age_buckets)
            row["unremediated_total"] = sum(
                row.get(f"unremediated_{bucket}", 0) or 0 for bucket in active_age_buckets
            )

        filtered_count = sum(row["total_count"] for row in aggregations)
        unremediated_count = sum(row["unremediated_count"] for row in aggregations)

        summary = {"total_count": filtered_count, "unremediated_count": unremediated_count, "total": {}, "unremediated": {}}
        for bucket in active_age_buckets:
            summary["total"][bucket] = sum(row.get(f"total_{bucket}", 0) or 0 for row in aggregations)
            summary["unremediated"][bucket] = sum(
                row.get(f"unremediated_{bucket}", 0) or 0 for row in aggregations
            )
        summary["total"]["total"] = sum(summary["total"].values())
        summary["unremediated"]["total"] = sum(summary["unremediated"].values())
    else:
        agg_expressions = [pl.count().alias("count")]
        for bucket in active_age_buckets:
            agg_expressions.append(pl.col(bucket).sum().alias(bucket))

        aggregated_df = (
            lazy_df.group_by(group_by_columns).agg(agg_expressions).sort(group_by_columns).collect(streaming=True)
        )
        aggregations = aggregated_df.to_dicts()
        for row in aggregations:
            row["total"] = sum(row.get(bucket, 0) or 0 for bucket in active_age_buckets)

        filtered_count = sum(row["count"] for row in aggregations)
        summary = {"total": filtered_count}
        for bucket in active_age_buckets:
            summary[bucket] = sum(row.get(bucket, 0) or 0 for row in aggregations)

    return {
        "success": True,
        "total_records": total_records,
        "filtered_records": filtered_count,
        "aggregations": aggregations,
        "summary": summary,
        "group_by": group_by_columns,
        "age_buckets": active_age_buckets,
        "bucket_set": active_bucket_set,
        "include_remediation_split": include_remediation_split,
        "retrieved_at": datetime.now().isoformat(),
        "_debug_info": {
            "requested_bucket_set": request.get("bucket_set", DEFAULT_BUCKET_SET),
            "active_bucket_set": active_bucket_set,
            "available_bucket_sets": get_available_bucket_sets(set(parquet_file.schema.names)),
            "error_age_present": "ErrorAge" in parquet_file.schema.names
            or "errorage" in [n.lower() for n in parquet_file.schema.names],
            "execution_mode": "subprocess",
        },
    }


def build_details_result(file_path: str, request: Dict[str, Any]) -> Dict[str, Any]:
    lazy_df = pl.scan_parquet(file_path)
    lazy_df = ensure_remediation_status(lazy_df)
    lazy_df, active_bucket_set, active_age_buckets = apply_age_bucket_set(
        lazy_df, request.get("bucket_set", DEFAULT_BUCKET_SET)
    )

    applied_filters: List[str] = []
    filters = request.get("filters") or {}
    for filter_key, filter_values in filters.items():
        if filter_values:
            column_name = FILTER_COLUMNS.get(filter_key)
            if column_name:
                lazy_df = lazy_df.filter(pl.col(column_name).is_in(filter_values))
                applied_filters.append(f"{column_name} in {filter_values}")

    bucket = request.get("bucket")
    if bucket and bucket in active_age_buckets:
        lazy_df = lazy_df.filter(pl.col(bucket).cast(pl.Int64) == 1)
        applied_filters.append(f"age_bucket={bucket}")

    if request.get("bucket_scope") == "unremediated":
        lazy_df = lazy_df.filter(pl.col("RemediationStatus") == "Unremediated")
        applied_filters.append("scope=unremediated")

    search_term = (request.get("search_term") or "").strip()
    search_column = request.get("search_column")
    if search_term and search_column:
        physical_col = FILTER_COLUMNS.get(search_column, search_column)
        lazy_df = lazy_df.filter(
            pl.col(physical_col).cast(pl.Utf8).str.to_lowercase().str.contains(search_term.lower(), literal=True)
        )
        applied_filters.append(f"search: {search_column} contains '{search_term}'")

    count_df = lazy_df.select(pl.count()).collect(streaming=True)
    total_filtered = count_df.item()

    sort_column = request.get("sort_column")
    sort_direction = (request.get("sort_direction") or "desc").lower()
    descending = sort_direction == "desc"

    if sort_column:
        lazy_df = lazy_df.sort(sort_column, descending=descending)
    else:
        try:
            lazy_df = lazy_df.sort("ErrorAge", descending=True)
        except Exception:
            pass

    page = max(1, int(request.get("page", 1)))
    page_size = max(1, int(request.get("page_size", 50)))
    start_idx = (page - 1) * page_size

    page_df = lazy_df.slice(start_idx, page_size).collect(streaming=True)
    data = page_df.to_dicts()

    total_pages = (total_filtered + page_size - 1) // page_size if total_filtered > 0 else 1
    return {
        "success": True,
        "data": data,
        "columns": page_df.columns,
        "bucket_set": active_bucket_set,
        "applied_filters": applied_filters,
        "bucket": bucket,
        "bucket_scope": request.get("bucket_scope"),
        "pagination": {
            "current_page": page,
            "page_size": page_size,
            "total_rows": total_filtered,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1,
        },
        "retrieved_at": datetime.now().isoformat(),
        "_debug_info": {
            "execution_mode": "subprocess",
        },
    }


def build_trend_result(file_path: str, request: Dict[str, Any]) -> Dict[str, Any]:
    lazy_df = pl.scan_parquet(file_path)
    lazy_df = ensure_remediation_status(lazy_df)
    try:
        lazy_df = ensure_business_date(lazy_df)
    except ValueError as exc:
        parquet_file = pq.ParquetFile(file_path)
        return {
            "success": True,
            "total_records": parquet_file.metadata.num_rows,
            "filtered_records": 0,
            "max_business_date": None,
            "statuses": [],
            "remediation_plans": [],
            "group_by": request.get("group_by") or [],
            "summary": {"total_count": 0, "status_counts": {}},
            "tables": {
                "monthly_status_last_5": [],
                "daily_status_last_5": [],
                "daily_status_current_month": [],
            },
            "grouped_tables": {
                "monthly_status_last_5": {"group_columns": [], "period_columns": [], "rows": []},
                "daily_status_last_5": {"group_columns": [], "period_columns": [], "rows": []},
                "daily_status_current_month": {"group_columns": [], "period_columns": [], "rows": []},
            },
            "charts": {
                "monthly_plan_status_last_5": {"data": [], "series": [], "line_options": []},
                "daily_plan_status_last_30": {"data": [], "series": [], "line_options": []},
            },
            "retrieved_at": datetime.now().isoformat(),
            "_debug_info": {"execution_mode": "subprocess", "warning": str(exc)},
        }

    parquet_file = pq.ParquetFile(file_path)
    total_records = parquet_file.metadata.num_rows

    filters = request.get("filters") or {}
    for filter_key, filter_values in filters.items():
        if filter_values:
            column_name = FILTER_COLUMNS.get(filter_key)
            if column_name:
                lazy_df = lazy_df.filter(pl.col(column_name).is_in(filter_values))

    lazy_df = lazy_df.filter(pl.col("_business_date").is_not_null())

    filtered_stats = lazy_df.select(
        [
            pl.len().alias("filtered_records"),
            pl.max("_business_date").alias("max_business_date"),
        ]
    ).collect(streaming=True).to_dicts()[0]

    filtered_records = int(filtered_stats.get("filtered_records") or 0)
    max_business_date = filtered_stats.get("max_business_date")

    if not filtered_records or max_business_date is None:
        return {
            "success": True,
            "total_records": total_records,
            "filtered_records": 0,
            "max_business_date": None,
            "statuses": [],
            "remediation_plans": [],
            "group_by": request.get("group_by") or [],
            "summary": {"total_count": 0, "status_counts": {}},
            "tables": {
                "monthly_status_last_5": [],
                "daily_status_last_5": [],
                "daily_status_current_month": [],
            },
            "grouped_tables": {
                "monthly_status_last_5": {"group_columns": [], "period_columns": [], "rows": []},
                "daily_status_last_5": {"group_columns": [], "period_columns": [], "rows": []},
                "daily_status_current_month": {"group_columns": [], "period_columns": [], "rows": []},
            },
            "charts": {
                "monthly_plan_status_last_5": {"data": [], "series": [], "line_options": []},
                "daily_plan_status_last_30": {"data": [], "series": [], "line_options": []},
            },
            "retrieved_at": datetime.now().isoformat(),
            "_debug_info": {"execution_mode": "subprocess"},
        }

    max_date = max_business_date if isinstance(max_business_date, date) else max_business_date.date()

    statuses = sorted(
        str(value)
        for value in lazy_df.select(pl.col("RemediationStatus").unique()).collect(streaming=True).to_series().to_list()
        if value is not None
    )
    plans = sorted(
        str(value)
        for value in lazy_df.select(pl.col("RemediationPlan").unique()).collect(streaming=True).to_series().to_list()
        if value is not None
    )

    monthly_periods = build_month_windows(max_date, 5)
    monthly_start = monthly_periods[0]
    daily_last_5_periods = build_day_windows(max_date - timedelta(days=4), max_date)
    current_month_periods = build_day_windows(first_day_of_month(max_date), max_date)
    daily_last_30_periods = build_day_windows(max_date - timedelta(days=29), max_date)

    group_by_columns: List[str] = []
    for column in request.get("group_by") or []:
        actual_col = FILTER_COLUMNS.get(str(column).lower().replace(" ", "_"), column)
        group_by_columns.append(actual_col)

    month_counts = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(monthly_start))
        .with_columns(pl.col("_business_date").dt.strftime("%Y-%m").alias("period_key"))
        .group_by(["period_key", "RemediationStatus"])
        .agg(pl.len().alias("count"))
        .sort("period_key")
        .collect(streaming=True)
        .to_dicts()
    )

    day_last_5_counts = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(daily_last_5_periods[0]))
        .with_columns(pl.col("_business_date").dt.strftime("%Y-%m-%d").alias("period_key"))
        .group_by(["period_key", "RemediationStatus"])
        .agg(pl.len().alias("count"))
        .sort("period_key")
        .collect(streaming=True)
        .to_dicts()
    )

    current_month_counts = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(current_month_periods[0]))
        .with_columns(pl.col("_business_date").dt.strftime("%Y-%m-%d").alias("period_key"))
        .group_by(["period_key", "RemediationStatus"])
        .agg(pl.len().alias("count"))
        .sort("period_key")
        .collect(streaming=True)
        .to_dicts()
    )

    monthly_chart_counts = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(monthly_start))
        .with_columns(pl.col("_business_date").dt.strftime("%Y-%m").alias("period_key"))
        .group_by(["period_key", "RemediationPlan", "RemediationStatus"])
        .agg(pl.len().alias("count"))
        .sort(["period_key", "RemediationPlan", "RemediationStatus"])
        .collect(streaming=True)
        .to_dicts()
    )

    daily_chart_counts = (
        lazy_df
        .filter(pl.col("_business_date") >= pl.lit(daily_last_30_periods[0]))
        .with_columns(pl.col("_business_date").dt.strftime("%Y-%m-%d").alias("period_key"))
        .group_by(["period_key", "RemediationPlan", "RemediationStatus"])
        .agg(pl.len().alias("count"))
        .sort(["period_key", "RemediationPlan", "RemediationStatus"])
        .collect(streaming=True)
        .to_dicts()
    )

    summary_rows = (
        lazy_df
        .group_by("RemediationStatus")
        .agg(pl.len().alias("count"))
        .collect(streaming=True)
        .to_dicts()
    )
    summary_status_counts = {str(row["RemediationStatus"]): int(row["count"] or 0) for row in summary_rows}

    return {
        "success": True,
        "total_records": total_records,
        "filtered_records": filtered_records,
        "max_business_date": max_date.isoformat(),
        "statuses": statuses,
        "remediation_plans": plans,
        "group_by": group_by_columns,
        "summary": {
            "total_count": filtered_records,
            "status_counts": summary_status_counts,
        },
        "tables": {
            "monthly_status_last_5": build_status_table(
                month_counts,
                monthly_periods,
                statuses,
                lambda value: value.strftime("%Y-%m"),
                lambda value: value.strftime("%b %Y"),
            ),
            "daily_status_last_5": build_status_table(
                day_last_5_counts,
                daily_last_5_periods,
                statuses,
                lambda value: value.strftime("%Y-%m-%d"),
                lambda value: value.strftime("%d %b"),
            ),
            "daily_status_current_month": build_status_table(
                current_month_counts,
                current_month_periods,
                statuses,
                lambda value: value.strftime("%Y-%m-%d"),
                lambda value: value.strftime("%d %b"),
            ),
        },
        "grouped_tables": {
            "monthly_status_last_5": build_grouped_matrix_table(
                lazy_df,
                monthly_periods,
                statuses,
                group_by_columns,
                monthly_start,
                "%Y-%m",
                lambda value: value.strftime("%b %Y"),
            ),
            "daily_status_last_5": build_grouped_matrix_table(
                lazy_df,
                daily_last_5_periods,
                statuses,
                group_by_columns,
                daily_last_5_periods[0],
                "%Y-%m-%d",
                lambda value: value.strftime("%d %b"),
            ),
            "daily_status_current_month": build_grouped_matrix_table(
                lazy_df,
                current_month_periods,
                statuses,
                group_by_columns,
                current_month_periods[0],
                "%Y-%m-%d",
                lambda value: value.strftime("%d %b"),
            ),
        },
        "charts": {
            "monthly_plan_status_last_5": build_stacked_chart(
                monthly_chart_counts,
                monthly_periods,
                statuses,
                plans,
                lambda value: value.strftime("%Y-%m"),
                lambda value: value.strftime("%b %Y"),
            ),
            "daily_plan_status_last_30": build_stacked_chart(
                daily_chart_counts,
                daily_last_30_periods,
                statuses,
                plans,
                lambda value: value.strftime("%Y-%m-%d"),
                lambda value: value.strftime("%d %b"),
            ),
        },
        "retrieved_at": datetime.now().isoformat(),
        "_debug_info": {
            "execution_mode": "subprocess",
            "max_business_date": max_date.isoformat(),
        },
    }


def main() -> int:
    try:
        payload = json.loads(input())
        file_path = payload["file_path"]
        mode = payload.get("mode", "aggregations")
        request = payload.get("request", {})

        if mode == "filter_options":
            result = build_filter_options_result(file_path)
        elif mode == "trends":
            result = build_trend_result(file_path, request)
        elif mode == "details":
            result = build_details_result(file_path, request)
        else:
            result = build_aggregation_result(file_path, request)

        print(json.dumps(result, default=str))
        return 0
    except Exception as exc:
        error = {
            "success": False,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(error), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
