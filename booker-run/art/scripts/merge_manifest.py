#!/usr/bin/env python3
"""Merge entries into public/assets/manifest.json safely (file lock + atomic rename).

Usage:
  python3 art/scripts/merge_manifest.py '{"l2-ground": {"file": "l2-ground.png", "width": 32, "height": 32}}'
  python3 art/scripts/merge_manifest.py --file fragment.json
Run from the booker-run folder or anywhere (paths resolve from this script).
Existing keys are replaced by the fragment's value; other keys are kept.
"""
import fcntl, json, os, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST = os.path.join(ROOT, "public", "assets", "manifest.json")
LOCK = MANIFEST + ".lock"

def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        with open(sys.argv[2]) as f:
            frag = json.load(f)
    elif len(sys.argv) == 2:
        frag = json.loads(sys.argv[1])
    else:
        print(__doc__); sys.exit(2)
    if not isinstance(frag, dict):
        sys.exit("fragment must be a JSON object of key -> entry")
    with open(LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = {}
        if os.path.exists(MANIFEST):
            with open(MANIFEST) as f:
                data = json.load(f)
        data.update(frag)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(MANIFEST), suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(tmp, MANIFEST)
        fcntl.flock(lock, fcntl.LOCK_UN)
    print(f"manifest: {len(data)} keys ({', '.join(sorted(frag))} merged)")

if __name__ == "__main__":
    main()
