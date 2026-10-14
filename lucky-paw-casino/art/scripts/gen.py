#!/usr/bin/env python3
"""Wrapper around image-gen that logs every call to art/spend.md.
Usage: gen.py ASSET_LABEL -- <imagegen generate args...>
"""
import json, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SPEND = os.path.join(HERE, "..", "spend.md")
IMG = os.path.expanduser("~/.claude/skills/image-gen/scripts/imagegen.py")

def main():
    label = sys.argv[1]
    args = sys.argv[sys.argv.index("--") + 1:]
    model = "openai/gpt-image-2"
    settings = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--model": model = args[i + 1]; i += 2; continue
        if a in ("--quality", "--aspect", "--resolution", "--param", "--n"):
            settings.append(f"{a[2:]}={args[i+1]}"); i += 2; continue
        if a == "-r": settings.append("ref:" + os.path.basename(args[i + 1])); i += 2; continue
        i += 1
    p = subprocess.run([sys.executable, IMG, "generate", *args], capture_output=True, text=True)
    sys.stdout.write(p.stdout); sys.stderr.write(p.stderr[-2000:])
    cost = None
    if p.returncode == 0:
        for line in p.stdout.splitlines()[::-1]:
            try:
                cost = json.loads(line).get("cost_usd"); break
            except Exception: pass
        cost_s = f"{cost:.4f}" if isinstance(cost, (int, float)) else "unknown"
    elif p.returncode == 3:
        cost_s = "unknown (exit 3)"
    else:
        cost_s = "0 (exit %d, not sent)" % p.returncode
    import fcntl
    lockf = open(SPEND + ".lock", "w"); fcntl.flock(lockf, fcntl.LOCK_EX)
    rows, total = [], 0.0
    if os.path.exists(SPEND):
        rows = [l for l in open(SPEND).read().splitlines() if l.startswith("| ") and not l.startswith("| asset") and not l.startswith("| ---")]
    rows.append(f"| {label} | {model} | {', '.join(settings)} | {cost_s} |")
    for r in rows:
        m = re.match(r".*\| ([0-9.]+) \|$", r)
        if m: total += float(m.group(1))
    unknown = sum(1 for r in rows if "unknown" in r)
    with open(SPEND, "w") as f:
        f.write("# Art spend ledger (Lucky Paw Casino)\n\nEvery image-gen call, including failures that may have billed.\n\n")
        f.write("| asset | model | settings | cost_usd |\n| --- | --- | --- | --- |\n")
        f.write("\n".join(rows) + "\n\n")
        f.write(f"**Running total: ${total:.4f}**" + (f" (+{unknown} call(s) of unknown cost)" if unknown else "") + "\n")
    print(f"[spend] this call: {cost_s}  running total: ${total:.4f}", file=sys.stderr)
    sys.exit(p.returncode)

main()
