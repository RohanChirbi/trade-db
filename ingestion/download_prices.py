# ingestion/download_prices.py : daily OHLCV from Yahoo Finance -> data/raw/daily_prices.csv
# Paths are relative to the repo root, so this runs from any directory.
from pathlib import Path
import yfinance as yf

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data/raw"; RAW.mkdir(parents=True, exist_ok=True)

tickers = ["RELIANCE.NS","TCS.NS","INFY.NS","HDFCBANK.NS","ICICIBANK.NS"]  # pick 15-30
df = yf.download(tickers, start="2023-01-01", end="2025-12-31", auto_adjust=False, group_by="ticker")
rows = df.stack(level=0, future_stack=True).reset_index()
rows.columns = [c.lower().replace(" ", "_") for c in rows.columns]
rows.to_csv(RAW / "daily_prices.csv", index=False)
print(f"wrote {len(rows)} rows to {RAW / 'daily_prices.csv'}")
