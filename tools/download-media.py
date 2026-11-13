#!/usr/bin/env python3
"""Copies every music and picture file of the site to a folder on your computer (an offsite copy of what only exists in Cloudflare storage).

  1. In the app: Settings > Backups > "Download the file list"   (saves soul-vault-files.json)
  2. python3 tools/download-media.py soul-vault-files.json ~/SoulVaultFiles

Safe to run again and again: files that are already there with the right size are skipped, so a second run only fetches what is new.
Needs nothing but Python 3. Add --dry-run to see what it would do without downloading.
"""
import json, os, sys, time, urllib.parse, urllib.request


def fetch(url, dest, size, tries=3):
    for n in range(tries):
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            part = dest + '.part'
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'soul-vault-backup'}), timeout=60) as r, open(part, 'wb') as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk: break
                    f.write(chunk)
            if size is not None and os.path.getsize(part) != size:
                raise IOError('size %d, expected %d' % (os.path.getsize(part), size))
            os.replace(part, dest)
            return None
        except Exception as e:  # noqa: BLE001
            err = str(e)
            try: os.remove(dest + '.part')
            except OSError: pass
            time.sleep(0.5 * (n + 1))
    return err


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    dry = '--dry-run' in argv
    base_override = next((a.split('=', 1)[1] for a in argv if a.startswith('--base=')), None)
    if len(args) != 2:
        sys.exit(__doc__)
    manifest, out = args
    d = json.load(open(manifest, encoding='utf8'))
    files = d.get('files') or []
    base = (base_override or d.get('base') or '').rstrip('/') + '/'
    if not files or not base.startswith('http'):
        sys.exit('This does not look like a Soul Vault file list.')
    out = os.path.expanduser(out)
    got = skipped = 0
    failed = []
    for i, f in enumerate(files, 1):
        key, size = f['key'], f.get('size')
        dest = os.path.join(out, *key.split('/'))
        if os.path.isfile(dest) and (size is None or os.path.getsize(dest) == size):
            skipped += 1
            continue
        if dry:
            print('would download', key)
            continue
        err = fetch(base + urllib.parse.quote(key, safe='/'), dest, size)
        if err:
            failed.append((key, err))
            print('FAILED', key, err)
        else:
            got += 1
            if got % 25 == 0: print('%d / %d ...' % (i, len(files)))
    total = sum(f.get('size') or 0 for f in files)
    print('Done. %d files (%.1f MB) in the list: %d downloaded, %d already there, %d failed.' % (len(files), total / 1048576, got, skipped, len(failed)))
    if failed:
        print('Run it again to retry the failed ones.')
        sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1:])
