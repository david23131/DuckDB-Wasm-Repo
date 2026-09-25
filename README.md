# MS MARCO Search

Search 8,841,823 MS MARCO passages in your browser with DuckDB-Wasm full-text search. Results are ranked with BM25. The index is built ahead of time and downloaded from Hugging Face; queries run locally.

[Open the search app](https://david23131.github.io/DuckDB-Wasm-Repo/)

## Search

1. Open the app in a supported desktop browser, such as Chrome.
2. Click **Download & open index (3.35 GB)** and wait for it to finish. Keep the tab open while downloading.
3. Enter a query and click **Search** to see up to ten matching passages.
4. After reloading or returning later, click **Reopen saved index** before searching. No second download is needed while the saved file remains in browser storage.

The index is stored in the browser’s Origin Private File System (OPFS), not the Downloads folder. Localhost and the public site have separate storage. Clearing browser storage removes the saved index. Downloads can be cancelled but cannot resume across reloads. Allow sufficient free disk space; replacing an existing index can temporarily require additional space.

No Hugging Face account or local `collection.tsv` is needed. Internet access is required to download the index and load DuckDB runtime and extension assets. Search itself executes on the visitor’s computer. Full-corpus queries can take several seconds, depending on the device and query.

## Run locally

```sh
git clone https://github.com/david23131/DuckDB-Wasm-Repo.git
cd DuckDB-Wasm-Repo
npm install
npm run dev
```

Open the local address printed by Vite (normally http://127.0.0.1:5173/).

```sh
npm test
npm run build
```

## Index and implementation

The [public prebuilt index](https://huggingface.co/datasets/DavidzzzZZZ/msmarco-duckdb-fts) contains the passage table and DuckDB FTS index. The default URL is pinned to revision `d8b39bc9edc94a16fb77359243163ed80c609c84` and expects 3,346,542,592 bytes. The download checks file size, not a cryptographic hash.

- `src/msmarco.js`: download/reopen controls, parameterized search, and text-only result rendering.
- `src/download-prebuilt.js`: streaming download into browser storage, progress, and cancellation.
- `src/prebuilt-msmarco.js`: opens the saved database with DuckDB-Wasm in read-only mode.
- `scripts/build-msmarco.py`: builds the database outside the browser using native DuckDB 1.4.3.

To build your own index:

```sh
uv run --with duckdb==1.4.3 python scripts/build-msmarco.py /path/to/collection.tsv artifacts/msmarco-prebuilt.duckdb
```

To override the download URL locally, set `VITE_MSMARCO_INDEX_URL` in `.env.local` and restart Vite. The host must allow browser requests through CORS. Update `downloadBytes` in `src/msmarco.js` if the artifact size changes.

## Deployment

Pushes to `main` trigger the GitHub Pages workflow. Set the repository Pages source to **GitHub Actions**. The optional Actions variable `MSMARCO_INDEX_URL` overrides the default download URL at build time. The large database stays on Hugging Face rather than in the Git repository or Pages artifact.

The earlier NFCorpus, OPFS, and scaling experiments are documented in [the historical experiment notes](docs/experiments.md). Their supporting modules remain in the repository but are not loaded by the search app.
