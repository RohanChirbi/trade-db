# Quant Trading Database Project

## Stack
- PostgreSQL: see compose.yaml for the current image version
- MongoDB
- Python ingestion scripts
- Docker Compose

## Current status
- Docker environment is working.
- yfinance download succeeds.
- Expected CSV outputs under data/processed/ are not populated.
- End-to-end ingestion is not yet verified.

## Setup
1. Copy .env.example to .env and set local credentials.
2. Run: docker compose up -d
3. Create a Python virtual environment.
4. Install dependencies using the project's dependency file.

## Data ingestion handoff
Next task: trace the downloaded market data through generate_data.py
and identify why processed CSV files are not written.

Check:
- Input and output paths
- Required command-line arguments
- Whether the script is run from the project root
- Filtering or validation that could produce empty datasets
- Whether the output-writing function is actually called

## Commands
Document the exact download, generation, loading and sanity-check
commands here using the filenames in this repository.
