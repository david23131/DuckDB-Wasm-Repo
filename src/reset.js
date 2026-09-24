// Delete only files owned by this demo, not other applications on the origin.
export async function deleteDemoFiles(root) {
  async function remove(directory, name) {
    try { await directory.removeEntry(name); }
    catch (error) { if (error.name !== 'NotFoundError') throw error; }
  }
  for (const name of [
    'analytics.duckdb.wal',
    'analytics.duckdb.wal.checkpoint',
    'analytics.duckdb.wal.recovery',
    'analytics.duckdb',
  ]) await remove(root, name);
  for (const [folder, name] of [
    ['cache', 'monthly_totals.parquet'],
    ['export', 'transactions.parquet'],
  ]) {
    let directory;
    try { directory = await root.getDirectoryHandle(folder); }
    catch (error) {
      if (error.name === 'NotFoundError') continue;
      throw error;
    }
    await remove(directory, name);
  }
}
