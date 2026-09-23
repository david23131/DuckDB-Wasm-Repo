# DuckDB-Wasm + OPFS reproduction

Source: [Persistent Databases in the Browser with DuckDB-Wasm and OPFS](https://duckdb.org/2026/09/18/opfs-wasm) (September 18, 2026).

## Run

```sh
cd /Users/daviddong/Desktop/UW_Research/DuckDB
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a modern browser. Keep that exact origin: changing host, port, or browser gives you a different OPFS store. Use one tab at a time because database file handles are exclusive. Internet access is required for the CDN worker/Wasm and the initial orders import.

## Walkthrough

1. Open `src/main.js` and start with `main()`: bundle selection → worker → instantiate → `db.open()` → connection.
2. On first load, Results shows the stored transactions. Every load inserts the article's sample row and runs `CHECKPOINT`.
3. Click **Reload page**. Expect one additional row. Close and reopen the tab at the same address to test longer-lived persistence.
4. Click **Load orders & cache monthly totals**. This runs the article's original import query, checkpoints, and writes/reads `opfs://cache/monthly_totals.parquet`. In our Chrome experiment, remote requests recurred after reload even though `SHOW TABLES` confirmed `orders` already existed. The cause has not been established. For a separate local-read experiment, reload, wait for Ready, then click **Query saved orders (local only)** with Network filtered by `orders.parquet`. This added button queries the saved table directly without submitting the remote import query or rewriting the Parquet cache. Expect totals with no matching requests.
5. **Download transactions.parquet** exercises SQL export with Zstandard compression.
6. **Download analytics.duckdb** checkpoints and downloads the database through the browser OPFS API. The downloaded database can be opened using native DuckDB.
7. **Checkpoint & close** explicitly releases the connection and worker. Reload to reconnect.

The repeated transaction ID is intentional, matching the article; the table has no primary key. BIGINT counts are displayed as strings to avoid JSON serialization errors. The UI serializes actions so exports and shutdown do not race queries.

## Key choices

- `@duckdb/duckdb-wasm` is pinned to **1.32.0**, one of the article's tested versions. The article warns that `1.33.1-dev57.0` has an OPFS path regression.
- `opfs: { fileHandling: 'auto' }` handles the SQL Parquet paths. For the manual alternative, omit this setting and use `db.registerOPFSFileName(path)` before each file's queries and `db.dropFile(path)` afterwards.
- Writes are explicitly checkpointed; no asynchronous unload handler is used as a durability mechanism.
- OPFS is scoped to this browser origin and may be evicted or cleared. Keep exported copies of data that matters.
- This is a local reproduction, with no backend or deployment configuration.

## Verification

`npm run build` checks that the lab bundles successfully. The steps above verify browser persistence and exports; a successful build alone does not prove OPFS behavior.
