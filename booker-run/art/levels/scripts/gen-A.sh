#!/bin/bash
# usage: gen-A.sh ASSET_LABEL [imagegen generate args...]
# Runs imagegen, logs asset/model/settings/cost/running total to art/spend-levels-A.md.
# Refuses to run if the running total + worst-case estimates for up to 3 parallel calls
# would pass the $3.50 cap. The ledger append runs under a file lock (parallel-safe).
ART="$(cd "$(dirname "$0")/../.." && pwd)"
LEDGER="$ART/spend-levels-A.md"
CAP=3.50
EST=0.10   # worst-case single sunburst call with references
LABEL="$1"; shift
if [ ! -f "$LEDGER" ]; then
  printf '# Art spend, Levels 2-6, agent A (cap $3.50)\n\n| asset | model | settings | cost_usd | running_total |\n|---|---|---|---|---|\n' > "$LEDGER"
fi
T=$(python3 - "$LEDGER" <<'PY'
import sys
t=0
for l in open(sys.argv[1]):
    p=[x.strip() for x in l.split('|')]
    if len(p)>5:
        try: t+=float(p[4])
        except: pass
print(f"{t:.6f}")
PY
)
if ! python3 -c "import sys; sys.exit(0 if $T + 3*$EST <= $CAP else 1)"; then
  echo "BUDGET STOP: running total \$$T + 3 x est \$$EST would pass \$$CAP"; exit 9
fi
OUT=$(python3 ~/.claude/skills/image-gen/scripts/imagegen.py generate "$@")
RC=$?
echo "$OUT"
SET=$(echo "$@" | grep -oE -- '--(quality|aspect|resolution|param|n) [^ ]+' | tr '\n' ' ')
NREF=$(echo " $@" | grep -oE -- ' -r ' | wc -l | tr -d ' ')
python3 - "$LEDGER" "$LABEL" "$RC" "$SET refs=$NREF" "$OUT" <<'PY'
import sys, json, fcntl
ledger, label, rc, settings, out = sys.argv[1:6]
with open(ledger + ".lock", "w") as lk:
    fcntl.flock(lk, fcntl.LOCK_EX)
    t = 0
    for l in open(ledger):
        p = [x.strip() for x in l.split('|')]
        if len(p) > 5:
            try: t += float(p[4])
            except: pass
    if rc == "0":
        d = json.loads(out.strip().splitlines()[-1])
        c = float(d.get("cost_usd") or 0)
        t += c
        line = f"| {label} | {d.get('model')} | {settings} | {c} | {t:.6f} |\n"
        print(f"RUNNING TOTAL: ${t:.6f} of $3.50")
    elif rc == "3":
        line = f"| {label} | (exit 3: outcome unknown, may have billed) | {settings} | ? | {t:.6f} |\n"
        print("EXIT 3: do not retry")
    else:
        line = None
    if line:
        open(ledger, "a").write(line)
PY
exit $RC
