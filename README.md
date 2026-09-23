# DuckDB-Wasm OPFS Lab

A small browser-based lab demonstrating persistent SQL databases with DuckDB-Wasm and the Origin Private File System (OPFS). Import a remote dataset, query saved tables after a page reload, and export data for use with native DuckDB.

Based on DuckDB’s article [Persistent Databases in the Browser with DuckDB-Wasm and OPFS](https://duckdb.org/2026/09/18/opfs-wasm) (September 18, 2026). This repository adapts the article’s examples into an interactive page and adds a separate local-query experiment.

## Getting started

Prerequisites:

- Node.js 22 or later and npm.
- A modern browser with OPFS support. The walkthrough has been exercised in Chrome.
- Internet access to load the DuckDB worker and WebAssembly files from the CDN, and to import the remote orders dataset.

From the repository directory, run:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5173/**. Native DuckDB is optional and is needed only to inspect exports outside the browser.

The development server serves the application; SQL queries execute inside the browser in a Web Worker. Database files are stored in the browser’s OPFS, not in the repository directory.

## Experiments

### 1. Persist transactions across reloads

On each page load, the application opens `opfs://analytics.duckdb`, creates the `transactions` table if necessary, inserts one sample purchase, and runs `CHECKPOINT`. The page displays the stored transactions.

Click **Reload page**. The previous rows should remain, with one additional row. To test an explicit shutdown, click **Checkpoint & close**, then reload to reopen the database.

Each sample purchase intentionally uses `id = 1`, matching the article. The table has no primary-key constraint, so duplicate IDs are allowed.

### 2. Import orders and cache monthly totals

Click **Load orders & cache monthly totals**. This button:

1. Runs the article’s `CREATE TABLE IF NOT EXISTS orders AS SELECT ...` statement against a remote Parquet dataset.
2. Checkpoints the database.
3. Aggregates orders by month and priority.
4. Writes the totals to `opfs://cache/monthly_totals.parquet` and reads back the first ten results.

The aggregation is recomputed and the Parquet cache is rewritten on every click.

**Observed difference from the article:** in the tested Chrome setup with DuckDB-Wasm 1.32.0, rerunning the import statement after a reload produced remote requests even when `SHOW TABLES` confirmed that `orders` already existed. The internal cause has not been established. `IF NOT EXISTS` should therefore not be treated as a guarantee of zero network access in this example.

### 3. Query the saved table without importing again

After importing orders, reload the page and wait for **Ready**. Open the browser’s Network panel, filter by `orders.parquet`, and click **Query saved orders (local only)**.

Monthly totals should appear without new requests matching that filter. This button queries `orders` directly; it does not submit the remote import statement or read the exported Parquet cache.

This demonstrates reuse of persisted data. It does not demonstrate fully offline startup: the application still loads DuckDB’s worker and WebAssembly files from a CDN.

### 4. Export the database

Click **Download analytics.duckdb**. The application checkpoints the database and downloads its main file through the browser’s OPFS API.

The export includes both database tables, `transactions` and `orders` (if imported). The separate Parquet cache is not included.

With native DuckDB installed, open the downloaded file:

```sh
duckdb /path/to/analytics.duckdb
```

Then inspect its contents:

```sql
SHOW TABLES;
SELECT count(*) AS transaction_count FROM transactions;
SELECT count(*) AS order_count FROM orders;
```

### 5. Export a table as Parquet

Click **Download transactions.parquet** to export the transaction table with Zstandard compression. Native DuckDB can query the downloaded file directly:

```sql
SELECT *
FROM read_parquet('/path/to/transactions.parquet')
ORDER BY ts
LIMIT 5;
```

Both downloads are snapshots. Later browser changes do not update previously downloaded files. Reloading between exports also adds another transaction, so exports made at different times may have different row counts.

## Storage and implementation notes

- **Origin-specific storage:** use the same browser profile and exact URL when testing persistence. Changing the scheme, host, or port selects a different storage origin.
- **One tab at a time:** OPFS file handles are exclusive; close other instances of the lab before opening the same database.
- **Checkpoints:** the application explicitly checkpoints after database writes and before database export or clean shutdown. It does not rely on an asynchronous page-unload handler.
- **Automatic file handling:** `opfs: { fileHandling: 'auto' }` manages the OPFS Parquet paths used in SQL.
- **Version pin:** DuckDB-Wasm is pinned to `1.32.0`, a version tested by the article. The article reports an OPFS path regression in `1.33.1-dev57.0`.
- **Storage lifetime:** browser storage can be cleared or evicted. Export data that needs an independent copy.
- **Display formatting:** some SQL values are converted to strings for readable JSON output; this does not change their stored column types.

## Project structure

```text
index.html        Page layout and experiment buttons
src/main.js       DuckDB initialization, SQL queries, and exports
src/style.css     Page styling
package.json      Dependencies and development commands
package-lock.json Locked dependency versions
```

Start with `main()` in `src/main.js` to follow initialization, then read the button handlers for each experiment.

## Build and validation

```sh
npm run build
```

The production bundle is generated in `dist/`. A successful build verifies bundling; persistence and exports require the browser experiments above. `node_modules/` and `dist/` are excluded from Git, and browser OPFS data is not part of the repository.
