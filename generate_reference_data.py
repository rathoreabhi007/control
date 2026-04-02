"""Generate dummy reference files for the Reference File Search feature."""
import csv, random, zipfile, io, json
from pathlib import Path
from datetime import date, timedelta
import polars as pl

random.seed(42)
out_dir = Path("api/data/reference_files")
out_dir.mkdir(parents=True, exist_ok=True)

# helpers
def rand_date(start=date(2023, 1, 1), end=date(2025, 12, 31)):
    delta = (end - start).days
    return (start + timedelta(days=random.randint(0, delta))).isoformat()

currencies    = ["USD","EUR","GBP","JPY","CHF","AUD","CAD","HKD","SGD","NOK"]
asset_classes = ["Equity","Fixed Income","FX","Commodity","Rates","Credit","Fund"]
countries     = ["US","GB","DE","FR","JP","AU","CA","HK","SG","CH","IT","ES"]
statuses      = ["Active","Inactive","Pending","Suspended","Matured"]
regions       = ["APAC","EMEA","AMER","LATAM"]
reg_types     = ["MiFID II","EMIR","CFTC","SEC","ASIC","MAS","FCA"]
freq_list     = ["Daily","Weekly","Monthly","Quarterly"]
isins         = [f"XS{random.randint(100000000000, 999999999999)}" for _ in range(200)]
counterparties= [f"CP_{i:04d}" for i in range(1, 51)]
sectors       = ["Banking","Insurance","Asset Manager","Hedge Fund","Corporate","Government","Pension"]
ratings       = ["AAA","AA+","AA","AA-","A+","A","A-","BBB+","BBB","BBB-","BB+","BB","NR"]
exchange_list = ["NYSE","LSE","XEUR","TSE","ASX","SGX","HKEX","NASDAQ","CME","ICE"]

# ── File 1: Trade Reference (comma-delimited CSV) ──────────────────────
rows_trade = []
for i in range(1, 1001):
    rows_trade.append({
        "TradeID":        f"TRD-{i:06d}",
        "ISIN":           random.choice(isins),
        "Instrument":     random.choice(["Bond","Equity","Option","Future","Swap","CDS","FX Forward"]),
        "AssetClass":     random.choice(asset_classes),
        "Currency":       random.choice(currencies),
        "Country":        random.choice(countries),
        "Region":         random.choice(regions),
        "Counterparty":   random.choice(counterparties),
        "TradeDate":      rand_date(date(2024, 1, 1), date(2025, 6, 30)),
        "SettlementDate": rand_date(date(2024, 1, 3), date(2025, 7, 5)),
        "Notional":       round(random.uniform(100_000, 50_000_000), 2),
        "Price":          round(random.uniform(0.5, 200.0), 4),
        "Quantity":       random.randint(100, 100_000),
        "Status":         random.choice(statuses),
        "RegType":        random.choice(reg_types),
        "Frequency":      random.choice(freq_list),
        "BookID":         f"BK-{random.randint(1, 20):02d}",
        "Trader":         f"TRADER_{random.randint(1, 30):02d}",
    })

trade_path = out_dir / "trade_reference.csv"
with open(trade_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows_trade[0].keys()))
    w.writeheader()
    w.writerows(rows_trade)
print(f"Created {trade_path} ({len(rows_trade)} rows, comma-delimited)")

# ── File 2: Counterparty Reference (pipe-delimited CSV) ────────────────
rows_cp = []
for i in range(1, 1001):
    rows_cp.append({
        "CounterpartyID":  f"CP_{i:04d}",
        "LegalName":       f"Counterparty Legal Name {i}",
        "ShortName":       f"CP {i}",
        "Sector":          random.choice(sectors),
        "Country":         random.choice(countries),
        "Region":          random.choice(regions),
        "Currency":        random.choice(currencies),
        "CreditRating":    random.choice(ratings),
        "LEI":             "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=20)),
        "Status":          random.choice(["Active","Inactive","Watch"]),
        "OnboardingDate":  rand_date(date(2010, 1, 1), date(2023, 12, 31)),
        "LastReviewDate":  rand_date(date(2023, 1, 1), date(2025, 6, 30)),
        "CreditLimit":     round(random.uniform(1_000_000, 500_000_000), 2),
        "ExposureUSD":     round(random.uniform(0, 100_000_000), 2),
        "RegType":         random.choice(reg_types),
        "Approved":        random.choice(["Yes","No"]),
        "RiskBand":        random.choice(["Low","Medium","High","Very High"]),
        "RelationshipMgr": f"RM_{random.randint(1, 15):02d}",
    })

cp_path = out_dir / "counterparty_reference.csv"
with open(cp_path, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows_cp[0].keys()), delimiter="|")
    w.writeheader()
    w.writerows(rows_cp)
print(f"Created {cp_path} ({len(rows_cp)} rows, pipe-delimited)")

# ── File 3: Instrument Static (CSV inside ZIP) ─────────────────────────
rows_inst = []
for i in range(1, 1001):
    rows_inst.append({
        "InstrumentID":  f"INST-{i:05d}",
        "ISIN":          random.choice(isins),
        "CUSIP":         "".join(random.choices("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", k=9)),
        "Ticker":        f"TKR{i:04d}",
        "Description":   f"Instrument Description {i}",
        "AssetClass":    random.choice(asset_classes),
        "SubAssetClass": random.choice(["Large Cap","Small Cap","IG","HY","Short","Long","Vanilla","Exotic"]),
        "Currency":      random.choice(currencies),
        "Country":       random.choice(countries),
        "Exchange":      random.choice(exchange_list),
        "Sector":        random.choice(sectors),
        "MaturityDate":  rand_date(date(2025, 1, 1), date(2035, 12, 31)),
        "IssueDate":     rand_date(date(2015, 1, 1), date(2024, 12, 31)),
        "Coupon":        round(random.uniform(0.0, 10.0), 4),
        "FaceValue":     random.choice([1000, 10000, 100, 1]),
        "Status":        random.choice(statuses),
        "RegType":       random.choice(reg_types),
        "Tradeable":     random.choice(["Yes","No"]),
        "Settleable":    random.choice(["Yes","No"]),
        "PricingSource": random.choice(["Bloomberg","Reuters","ICE","Manual"]),
    })

csv_buf = io.StringIO()
w = csv.DictWriter(csv_buf, fieldnames=list(rows_inst[0].keys()))
w.writeheader()
w.writerows(rows_inst)

zip_path = out_dir / "instrument_static.zip"
with zipfile.ZipFile(str(zip_path), "w", compression=zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("instrument_static.csv", csv_buf.getvalue())
print(f"Created {zip_path} (instrument_static.csv inside, {len(rows_inst)} rows)")

# ── File 4: Market Data (Parquet) ──────────────────────────────────────
sources    = ["Bloomberg", "Reuters", "ICE", "Refinitiv", "Manual"]
rows_mkt = []
for i in range(1, 1001):
    close = round(random.uniform(0.5, 500.0), 4)
    open_ = round(close * random.uniform(0.97, 1.03), 4)
    high  = round(max(open_, close) * random.uniform(1.0, 1.05), 4)
    low   = round(min(open_, close) * random.uniform(0.95, 1.0), 4)
    rows_mkt.append({
        "TradeID":    f"TRD-{random.randint(1, 1000):06d}",
        "ISIN":       random.choice(isins),
        "AssetClass": random.choice(asset_classes),
        "Currency":   random.choice(currencies),
        "PriceDate":  rand_date(date(2024, 1, 1), date(2025, 6, 30)),
        "OpenPrice":  open_,
        "ClosePrice": close,
        "HighPrice":  high,
        "LowPrice":   low,
        "Volume":     random.randint(1_000, 10_000_000),
        "VWAP":       round(random.uniform(low, high), 4),
        "DV01":       round(random.uniform(-50_000, 50_000), 2),
        "CS01":       round(random.uniform(-10_000, 10_000), 2),
        "Delta":      round(random.uniform(-1.0, 1.0), 6),
        "Gamma":      round(random.uniform(0.0, 0.1), 6),
        "Vega":       round(random.uniform(0.0, 500_000), 2),
        "Theta":      round(random.uniform(-5_000, 0), 2),
        "PnL":        round(random.uniform(-1_000_000, 1_000_000), 2),
        "Source":     random.choice(sources),
        "Validated":  random.choice(["Yes", "No"]),
    })

parquet_path = out_dir / "market_data.parquet"
df_mkt = pl.DataFrame(rows_mkt)
df_mkt.write_parquet(str(parquet_path))
print(f"Created {parquet_path} ({len(rows_mkt)} rows, Parquet format)")

# ── Update reference_files.json ────────────────────────────────────────
config_path = Path("api/data/reference_search.json")
config = {
    "files": [
        {
            "id": "trade_reference",
            "name": "Trade Reference",
            "description": "Trade-level reference data: instrument, counterparty, dates, notional, status",
            "path": "api/data/reference_files/trade_reference.csv",
            "format": "csv",
            "delimiter": ",",
            "encoding": "utf-8",
            "has_header": True,
            "columns": [
                "TradeID","ISIN","Instrument","AssetClass","Currency","Country","Region",
                "Counterparty","TradeDate","SettlementDate","Notional","Price","Quantity",
                "Status","RegType","Frequency","BookID","Trader"
            ]
        },
        {
            "id": "counterparty_reference",
            "name": "Counterparty Reference",
            "description": "Counterparty master data: legal names, ratings, credit limits, regions (pipe-delimited)",
            "path": "api/data/reference_files/counterparty_reference.csv",
            "format": "csv",
            "delimiter": "|",
            "encoding": "utf-8",
            "has_header": True,
            "columns": [
                "CounterpartyID","LegalName","ShortName","Sector","Country","Region",
                "Currency","CreditRating","LEI","Status","OnboardingDate","LastReviewDate",
                "CreditLimit","ExposureUSD","RegType","Approved","RiskBand","RelationshipMgr"
            ]
        },
        {
            "id": "instrument_static",
            "name": "Instrument Static (ZIP)",
            "description": "Instrument static data inside ZIP archive: ISIN, CUSIP, asset class, exchange, maturity",
            "path": "api/data/reference_files/instrument_static.zip",
            "format": "zip",
            "inner_file": "instrument_static.csv",
            "delimiter": ",",
            "encoding": "utf-8",
            "has_header": True,
            "columns": [
                "InstrumentID","ISIN","CUSIP","Ticker","Description","AssetClass",
                "SubAssetClass","Currency","Country","Exchange","Sector","MaturityDate",
                "IssueDate","Coupon","FaceValue","Status","RegType","Tradeable",
                "Settleable","PricingSource"
            ]
        },
        {
            "id": "market_data",
            "name": "Market Data (Parquet)",
            "description": "Daily market prices and risk metrics stored in Parquet format",
            "path": "api/data/reference_files/market_data.parquet",
            "format": "parquet",
            "columns": [
                "TradeID","ISIN","AssetClass","Currency","PriceDate",
                "OpenPrice","ClosePrice","HighPrice","LowPrice","Volume","VWAP",
                "DV01","CS01","Delta","Gamma","Vega","Theta","PnL","Source","Validated"
            ]
        }
    ]
}

with open(config_path, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2)
print(f"Updated {config_path}")
print("Done.")
