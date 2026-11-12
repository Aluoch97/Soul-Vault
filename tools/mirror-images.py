#!/usr/bin/env python3
"""Copies every image the public site shows (covers, song covers, page backgrounds, photos) from Google Drive into our own R2 bucket,
at the sizes the app asks for, under  img/<fileId>/<size>  (sizes: t, 160, 400, 1200, 1600). Safe to run again: images already there are skipped.

  python3 tools/mirror-images.py            # copy everything missing
  python3 tools/mirror-images.py --dry      # only list what would be copied
  python3 tools/mirror-images.py --only <fileId>

Needs: the Cloudflare API token as the proxy-injected credential for api.cloudflare.com (the session sets this up), or CF_TOKEN in the environment.
Only images a logged-out visitor can already see are copied (it asks Apps Script with the public link), so hidden and sealed releases never reach the public bucket.
After a sealed release unlocks, run this again.
"""
import json, sys, os, re, time, base64, urllib.request, urllib.error, concurrent.futures as cf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = json.load(open(os.path.join(ROOT, 'site.config.json'), encoding='utf8'))
ACCOUNT = os.environ.get('CF_ACCOUNT', 'b7af57b82b39da4cdd83be424190590e')
BUCKET = 'soulvault-media'
MEDIA = 'https://media.soulnicolas.com/img/'
UA = {'User-Agent': 'Mozilla/5.0 (soulvault-mirror)'}


def gas(fn, *args, tries=3):
    body = json.dumps({'fn': fn, 'args': list(args)}).encode()
    for i in range(tries):
        try:
            r = urllib.request.urlopen(urllib.request.Request(CFG['api'], data=body), timeout=120)
            j = json.load(r)
            if not j.get('ok'): raise RuntimeError(j.get('error'))
            return j['result']
        except Exception as e:
            err = e; time.sleep(1.5 * (i + 1))
    raise err


def exists(fid, size):
    try:
        r = urllib.request.urlopen(urllib.request.Request(MEDIA + fid + '/' + size, method='HEAD', headers=UA), timeout=30)
        return r.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception:
        return False


def put(fid, size, mime, data):
    url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/r2/buckets/{BUCKET}/objects/img/{fid}/{size}'
    h = {'content-type': mime, 'cache-control': 'public, max-age=31536000, immutable'}
    if os.environ.get('CF_TOKEN'): h['authorization'] = 'Bearer ' + os.environ['CF_TOKEN']
    r = urllib.request.urlopen(urllib.request.Request(url, data=data, method='PUT', headers=h), timeout=120)
    return json.load(r).get('success')


# size label -> what to ask getCover for (False = the small thumbnail, a number = that many pixels wide)
ASK = {'t': False, '160': 160, '400': 400, '1200': 1200, '1600': 1600}


def wanted(lib):
    """(fileId, size, kind) for everything a visitor can see."""
    out = []
    seen = set()
    def add(fid, sizes, kind):
        fid = (fid or '').strip()
        if not fid or re.search(r'[^A-Za-z0-9_-]', fid): return
        for s in sizes:
            if (fid, s) not in seen: seen.add((fid, s)); out.append((fid, s, kind))
    for r in lib['releases']:
        if r.get('locked'): continue
        add(r.get('cover_file_id'), ['t', '400', '1200'], 'cover'); add(r.get('clean_cover_file_id'), ['t', '1200'], 'cover')
        add(r.get('bg_file_id'), ['1600'], 'background')
        for c in str(r.get('extra_covers') or '').split(','): add(c.split('|')[0], ['400', '1600'], 'cover')
    vis = {r['release_id'] for r in lib['releases'] if not r.get('locked')}
    for t in lib['tracks']:
        if t['release_id'] in vis: add(t.get('track_cover'), ['t', '1200'], 'song cover')
    for e in lib['extras']:
        if e.get('kind') == 'photo' and e.get('release_id') in vis: add(e.get('file_id'), ['160', '400', '1600'], 'photo')
    return out


def copy_one(item):
    fid, size, kind = item
    if exists(fid, size): return (item, 'have')
    try:
        u = gas('getCover', fid, '', CFG['publicToken'], ASK[size])
    except Exception as e:
        return (item, 'error: ' + str(e)[:80])
    m = re.match(r'^data:([^;,]+);base64,(.+)$', u or '', re.S)
    if not m: return (item, 'skipped (' + ('not a plain picture: animated or not open to the public' if u else 'not available') + ')')
    data = base64.b64decode(m.group(2))
    if len(data) < 200: return (item, 'skipped (empty)')
    try: put(fid, size, m.group(1), data)
    except Exception as e: return (item, 'upload failed: ' + str(e)[:80])
    return (item, 'copied')


def main():
    dry = '--dry' in sys.argv
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else ''
    lib = gas('getShare', CFG['publicToken'])
    items = [i for i in wanted(lib) if not only or i[0] == only]
    print(f'{len(items)} images to check ({len({i[0] for i in items})} files)')
    if dry:
        for i in items[:20]: print('  ', i)
        return
    tally = {}; bad = []
    with cf.ThreadPoolExecutor(6) as ex:
        for n, (item, res) in enumerate(ex.map(copy_one, items), 1):
            k = res.split(' ')[0].rstrip(':'); tally[k] = tally.get(k, 0) + 1
            if res not in ('have', 'copied'): bad.append((item, res))
            if n % 50 == 0: print(f'  {n}/{len(items)}', tally, flush=True)
    print('done', tally)
    for item, res in bad[:40]: print('  ', item, res)


if __name__ == '__main__':
    main()
