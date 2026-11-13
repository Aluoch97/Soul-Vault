#!/usr/bin/env python3
"""Turns a Soul Vault backup (the .json from Settings > Backups > Download, or a .json.gz from the private soulvault-backups bucket)
into a SQL file that rebuilds the Cloudflare database tables.

  python3 tools/restore-backup.py backup.json restore.sql

It only WRITES the file. Nothing is changed until you run it, for example (this REPLACES the data in those tables):
  npx wrangler d1 execute soul-vault-db --remote --file restore.sql
For a dry run, load it into a scratch SQLite file first:  sqlite3 scratch.db < restore.sql

What a backup holds: every table in the D1 database (kv: owned catalog, native rows, overlay, missing-files list, owner password hash, ...;
shares, listens, live, comments, errors, fans, site_views, news_sends, news_survey). It leaves out the derived copy of the Sheet (kv keys "p:*" and "meta"), which rebuilds itself.
Music and picture files are NOT in a backup (they live in the soulvault-media bucket; masters are on Nick's own drive).
"""
import gzip, json, sys

DDL = {
    'kv': 'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)',
    'shares': 'CREATE TABLE IF NOT EXISTS shares (token TEXT PRIMARY KEY, target_type TEXT, target_id TEXT, label TEXT, allow_download INTEGER, expires TEXT, active INTEGER, plays INTEGER, created TEXT, fan_name TEXT, member_no INTEGER)',
    'listens': 'CREATE TABLE IF NOT EXISTS listens (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, track_id TEXT, version_id TEXT, release_id TEXT, share_token TEXT, device_id TEXT, seconds INTEGER, pct INTEGER, outcome TEXT, device TEXT)',
    'comments': 'CREATE TABLE IF NOT EXISTS comments (comment_id TEXT PRIMARY KEY, version_id TEXT, token TEXT, name TEXT, time_sec REAL, text TEXT, created TEXT, resolved INTEGER)',
    'errors': 'CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, mode TEXT, message TEXT)',
    'fans': 'CREATE TABLE IF NOT EXISTS fans (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, first_name TEXT, last_name TEXT, email TEXT UNIQUE, consent INTEGER, city TEXT, birth_year TEXT, social TEXT, how_heard TEXT, favorite TEXT, source TEXT, ip_hash TEXT, news INTEGER DEFAULT 0)',
    'live': 'CREATE TABLE IF NOT EXISTS live (device_id TEXT PRIMARY KEY, at INTEGER, share_token TEXT, track_id TEXT, version_id TEXT, release_id TEXT, device TEXT)',
    'news_sends': 'CREATE TABLE IF NOT EXISTS news_sends (day TEXT PRIMARY KEY, subject TEXT, sent INTEGER, total INTEGER, mode TEXT, at INTEGER)',
    'news_survey': 'CREATE TABLE IF NOT EXISTS news_survey (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, email TEXT, video TEXT, response TEXT)',
    'site_views': 'CREATE TABLE IF NOT EXISTS site_views (view_id TEXT PRIMARY KEY, at INTEGER, last INTEGER, visit_id TEXT, device_id TEXT, share_token TEXT, path TEXT, device TEXT, city TEXT, region TEXT, country TEXT, ref TEXT, seconds INTEGER)',
}


def lit(v):
    if v is None: return 'NULL'
    if isinstance(v, bool): return '1' if v else '0'
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def main(src, dst):
    raw = open(src, 'rb').read()
    if raw[:2] == b'\x1f\x8b': raw = gzip.decompress(raw)
    d = json.loads(raw.decode('utf8'))
    if d.get('format') != 1 or 'tables' not in d: sys.exit('This does not look like a Soul Vault backup.')
    out = []
    for name, rows in d['tables'].items():
        if name not in DDL: print('skipping unknown table', name); continue
        out.append(DDL[name] + ';')
        if name == 'kv':   # keep the derived Sheet copy (p:* and meta) that is already in the database; only replace what the backup holds
            for r in rows: out.append('INSERT OR REPLACE INTO kv (k, v) VALUES (%s, %s);' % (lit(r['k']), lit(r['v'])))
            continue
        out.append('DELETE FROM %s;' % name)
        for r in rows:
            cols = list(r.keys())
            out.append('INSERT INTO %s (%s) VALUES (%s);' % (name, ', '.join(cols), ', '.join(lit(r[c]) for c in cols)))
    open(dst, 'w', encoding='utf8').write('\n'.join(out) + '\n')
    print('wrote', dst, '|', {n: len(r) for n, r in d['tables'].items()})


if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
