"""Build an MS MARCO FTS database with native DuckDB 1.4.3.
Run: uv run --with duckdb==1.4.3 python scripts/build-msmarco.py SOURCE OUTPUT
"""
import argparse
import json
from pathlib import Path
import time
import duckdb

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--limit', type=int, default=None)
parser.add_argument('--memory', default='4GB')
parser.add_argument('--threads', type=int, default=2)
args = parser.parse_args()
if duckdb.__version__ != '1.4.3':
    parser.error('Use duckdb==1.4.3 to match the browser engine.')
if args.output.exists():
    parser.error('Output already exists; choose a new path to preserve previous results.')
if not args.source.is_file() or (args.limit is not None and args.limit < 1):
    parser.error('Provide a readable corpus and a positive limit.')
args.output.parent.mkdir(parents=True, exist_ok=True)
report = dict(engine=duckdb.__version__, source=str(args.source.resolve()), limit=args.limit,
              memory_limit=args.memory, threads=args.threads, status='running')
report_path = args.output.with_suffix('.build.json')
def log(stage):
    report['stage'] = stage
    report_path.write_text(json.dumps(report, indent=2))
    print(stage, flush=True)
con = duckdb.connect(str(args.output), config={
    'memory_limit': args.memory, 'threads': args.threads,
    'temp_directory': str(args.output) + '.tmp',
    'max_temp_directory_size': '6GB',
    'extension_directory': str(args.output.parent / '.extensions'),
})
try:
    log('Loading FTS')
    con.execute('INSTALL fts; LOAD fts')
    log('Importing passages')
    start = time.perf_counter()
    # Disable CSV quoting: MS MARCO is ID<TAB>passage with literal quotes in text.
    limit = f' LIMIT {args.limit}' if args.limit else ''
    con.execute("""CREATE TABLE msmarco AS SELECT * FROM read_csv(?,
      delim='\t', header=false, quote='', escape='',
      columns={'id':'VARCHAR','contents':'VARCHAR'}, parallel=false)""" + limit,
      [str(args.source.resolve())])
    report['import_seconds'] = time.perf_counter() - start
    report['passages'] = con.execute('SELECT count(*) FROM msmarco').fetchone()[0]
    con.execute('CHECKPOINT')
    log(f"Indexing {report['passages']} passages")
    start = time.perf_counter()
    con.execute("PRAGMA create_fts_index('msmarco','id','contents')")
    report['index_seconds'] = time.perf_counter() - start
    con.execute('CHECKPOINT')
    log('Testing search')
    start = time.perf_counter()
    rows = con.execute("""SELECT id, fts_main_msmarco.match_bm25(id, ?) AS score
      FROM msmarco WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT 10""",
      ['what is a corporation']).fetchall()
    report['query_seconds'] = time.perf_counter() - start
    report['example_results'] = rows
    report['status'] = 'complete'
except BaseException as error:
    report['status'] = 'failed'
    report['error'] = str(error)
    raise
finally:
    con.close()
    report['database_bytes'] = args.output.stat().st_size
    report_path.write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2), flush=True)
