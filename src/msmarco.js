import { passageBatches } from './msmarco-stream.js';
import { copyPrebuilt, openPrebuilt, PREBUILT_NAME } from './prebuilt-msmarco.js';
import { downloadPrebuilt } from './download-prebuilt.js';

export function setupMSMarco(db, conn, run) {
  const status = document.querySelector('#marco-status');
  const output = document.querySelector('#marco-results');
  const measurements = document.querySelector('#marco-metrics');
  const records = [];
  let prebuilt;
  const sourceChoice = document.querySelector('#marco-source');
  const downloadUrl = import.meta.env.VITE_MSMARCO_INDEX_URL ||
    'https://huggingface.co/datasets/DavidzzzZZZ/msmarco-duckdb-fts/resolve/d8b39bc9edc94a16fb77359243163ed80c609c84/msmarco-prebuilt.duckdb';
  const downloadBytes = 3346542592;
  const progress = document.querySelector('#marco-progress');
  const cancelDownload = document.querySelector('#marco-cancel-download');
  let downloadController;
  cancelDownload.onclick = () => downloadController?.abort();
  async function closePrebuilt() {
    if (prebuilt) { await prebuilt.close(); prebuilt = undefined; }
  }
  const save = record => {
    records.push({ timestamp: new Date().toISOString(), ...record });
    measurements.textContent = JSON.stringify(records, null, 2);
  };
  const action = task => run(async () => {
    try { await task(); }
    catch (error) {
      status.textContent = `MS MARCO error: ${error.message}. A failed browser build can be retried by importing again; a prebuilt database must come from a completed native build.`;
      throw error;
    }
  });
  const load = async () => { await conn.query('INSTALL fts'); await conn.query('LOAD fts'); };
  const hasIndex = async () => Number((await conn.query(`SELECT count(*) AS n
    FROM information_schema.schemata WHERE schema_name='fts_main_msmarco'
    AND catalog_name=current_database()`)).toArray()[0].n) > 0;

  async function connectPrebuilt() {
    prebuilt = await openPrebuilt();
    sourceChoice.value = 'prebuilt';
    status.textContent = `Opened prebuilt index: ${prebuilt.count.toLocaleString()} passages. Ready to search without browser indexing.`;
  }
  document.querySelector('#marco-fetch').onclick = () => {
    if (!downloadUrl) {
      status.textContent = 'The public index download is not available yet. You can still select a local prebuilt database below.';
      return;
    }
    if (!confirm('Download 3.35 GB into browser storage and replace any saved prebuilt index? Close other demo tabs first.')) return;
    return action(async () => {
      await closePrebuilt();
      const estimate = await navigator.storage.estimate();
      if (estimate.quota != null && estimate.usage != null && estimate.quota - estimate.usage < downloadBytes) {
        throw new Error('Not enough available browser storage for this download.');
      }
      downloadController = new AbortController();
      cancelDownload.disabled = false;
      progress.hidden = false;
      progress.value = 0;
      const start = performance.now();
      let lastUpdate = 0;
      try {
        status.textContent = 'Starting index download…';
        await downloadPrebuilt({ url: downloadUrl, bytes: downloadBytes,
          root: await navigator.storage.getDirectory(), name: PREBUILT_NAME,
          signal: downloadController.signal,
          onProgress(received, total) {
            const now = performance.now();
            if (now - lastUpdate < 200 && received !== total) return;
            lastUpdate = now;
            progress.value = received / total * 100;
            status.textContent = `Downloading index: ${(received / 1e9).toFixed(2)} / ${(total / 1e9).toFixed(2)} GB (${progress.value.toFixed(1)}%).`;
          },
        });
        cancelDownload.disabled = true;
        status.textContent = 'Download complete. Opening the saved index…';
        await connectPrebuilt();
        save({ event: 'download-prebuilt', bytes: downloadBytes, passages: prebuilt.count,
          downloadAndOpenMs: performance.now() - start });
      } catch (error) {
        if (error.name === 'AbortError') {
          status.textContent = 'Download cancelled. No partial download was committed. Reopen a previously saved index if one exists.';
          return;
        }
        throw error;
      } finally {
        cancelDownload.disabled = true;
        progress.hidden = true;
        downloadController = undefined;
      }
    });
  };
  document.querySelector('#marco-copy').onclick = () => {
    const file = document.querySelector('#marco-db-file').files[0];
    if (!file) { status.textContent = 'Select a native-built .duckdb file first.'; return; }
    if (!confirm('Replace the saved prebuilt MS MARCO database in this browser? Other demo tables are unaffected. Close other tabs using it first.')) return;
    return action(async () => {
      await closePrebuilt();
      output.replaceChildren();
      status.textContent = 'Copying the prebuilt database into browser storage…';
      const start = performance.now();
      await copyPrebuilt(file, await navigator.storage.getDirectory());
      const copyMs = performance.now() - start;
      status.textContent = 'Opening and validating the saved FTS index…';
      await connectPrebuilt();
      save({ event: 'open-prebuilt', source: file.name, bytes: file.size,
        passages: prebuilt.count, copyMs, totalOpenMs: performance.now() - start });
    });
  };
  document.querySelector('#marco-reopen').onclick = () => action(async () => {
    await closePrebuilt();
    status.textContent = 'Opening the saved prebuilt database…';
    await connectPrebuilt();
  });

  document.querySelector('#marco-import').onclick = () => {
    const file = document.querySelector('#marco-file').files[0];
    if (!file) { status.textContent = 'Select the MS MARCO passage collection.tsv file first.'; return; }
    const size = document.querySelector('#marco-size').value;
    if (!confirm(`Import ${size === 'all' ? 'all' : Number(size).toLocaleString()} passages? This replaces only the previous MS MARCO experiment. Large builds may exceed browser memory.`)) return;
    return action(async () => {
      output.replaceChildren();
      status.textContent = 'Loading FTS and preparing the MS MARCO experiment…';
      await load();
      if (await hasIndex()) await conn.query("PRAGMA drop_fts_index('msmarco')");
      await conn.query('DROP TABLE IF EXISTS msmarco');
      await conn.query('CREATE TABLE msmarco (id VARCHAR PRIMARY KEY, contents VARCHAR)');
      const start = performance.now();
      let count = 0;
      for await (const batch of passageBatches(file.stream(), size === 'all' ? Infinity : Number(size))) {
        await db.registerFileText('msmarco-batch.jsonl', batch.map(row => JSON.stringify(row)).join('\n'));
        try {
          await conn.query(`INSERT INTO msmarco SELECT id, contents
            FROM read_json_auto('msmarco-batch.jsonl', format='newline_delimited',
              columns={id:'VARCHAR', contents:'VARCHAR'})`);
        } finally { await db.dropFile('msmarco-batch.jsonl'); }
        count += batch.length;
        status.textContent = `Imported ${count.toLocaleString()} passages…`;
      }
      if (!count) throw new Error('The selected corpus is empty');
      const importMs = performance.now() - start;
      status.textContent = `Indexing ${count.toLocaleString()} passages in DuckDB-Wasm…`;
      const indexStart = performance.now();
      await conn.query("PRAGMA create_fts_index('msmarco', 'id', 'contents', overwrite=1)");
      const indexMs = performance.now() - indexStart;
      const checkpointStart = performance.now();
      await conn.query('CHECKPOINT');
      const checkpointMs = performance.now() - checkpointStart;
      const version = (await conn.query('SELECT version() AS v')).toArray()[0].v;
      const storage = await navigator.storage.estimate();
      sourceChoice.value = 'browser';
      save({ event: 'build', source: file.name, sourceBytes: file.size, selection: size,
        passages: count, importMs, indexMs, checkpointMs, engine: version,
        originStorageBytes: storage.usage ?? null, originQuotaBytes: storage.quota ?? null,
        userAgent: navigator.userAgent });
      status.textContent = `${count.toLocaleString()} passages indexed. Ready to search. Reloading preserves this index.`;
    });
  };
  document.querySelector('#marco-form').onsubmit = event => {
    event.preventDefault();
    const query = document.querySelector('#marco-query').value.trim();
    if (!query) return;
    return action(async () => {
      output.replaceChildren();
      const source = sourceChoice.value;
      if (source === 'prebuilt' && !prebuilt) {
        status.textContent = 'Open a prebuilt database or reopen its saved copy first.';
        return;
      }
      if (source === 'browser') {
        if (!await hasIndex()) { status.textContent = 'Import MS MARCO and build its index first.'; return; }
        await load();
      }
      const searchConn = source === 'prebuilt' ? prebuilt.conn : conn;
      const count = Number((await searchConn.query('SELECT count(*) AS n FROM msmarco')).toArray()[0].n);
      const start = performance.now();
      const stmt = await searchConn.prepare(`SELECT id, contents,
        fts_main_msmarco.match_bm25(id, ?) AS score FROM msmarco
        WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT 10`);
      let rows;
      try { rows = (await stmt.query(query)).toArray(); }
      finally { await stmt.close(); }
      const queryMs = performance.now() - start;
      for (const row of rows) {
        const item = document.createElement('li');
        const heading = document.createElement('strong');
        heading.textContent = `${row.id} · BM25 ${Number(row.score).toFixed(4)}`;
        const text = document.createElement('p');
        text.textContent = row.contents;
        item.append(heading, text);
        output.append(item);
      }
      save({ event: 'search', source, passages: count, query, queryMs, hits: rows.length,
        topIds: rows.map(row => row.id) });
      status.textContent = `${rows.length} results from ${count.toLocaleString()} passages (${source}); ${queryMs.toFixed(1)} ms (prepare, execute, transfer; excludes rendering).`;
    });
  };
  document.querySelector('#marco-download').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'msmarco-measurements.json' });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return { close: closePrebuilt };
}
