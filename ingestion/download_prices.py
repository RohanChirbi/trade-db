# scripts/download_prices.py
import yfinance as yf
tickers = ["RELIANCE.NS","TCS.NS","INFY.NS","HDFCBANK.NS","ICICIBANK.NS"]  # pick 15-30
df = yf.download(tickers, start="2023-01-01", end="2025-12-31", auto_adjust=False, group_by="ticker")
rows = df.stack(level=0).reset_index()
rows.columns = [c.lower().replace(" ", "_") for c in rows.columns]
rows.to_csv("data/raw/daily_prices.csv", index=False)
