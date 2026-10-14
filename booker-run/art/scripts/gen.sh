#!/bin/bash
# usage: gen.sh ASSET_LABEL [imagegen generate args...]
# Runs imagegen and appends the cost line to art/spend.md
ART="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="$1"; shift
OUT=$(python3 ~/.claude/skills/image-gen/scripts/imagegen.py generate "$@")
RC=$?
echo "$OUT"
if [ $RC -eq 0 ]; then
  COST=$(echo "$OUT" | tail -1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); print(d.get("cost_usd"), d.get("model"))')
  echo "| $LABEL | ${COST#* } | $(echo "$@" | grep -oE -- '--(quality|aspect|resolution|param) [^ ]+' | tr '\n' ' ') | ${COST%% *} |" >> "$ART/spend.md"
fi
python3 - "$ART/spend.md" <<'PY'
import sys
t=0
for l in open(sys.argv[1]):
    p=[x.strip() for x in l.split('|')]
    if len(p)>4:
        try: t+=float(p[4])
        except: pass
print(f"RUNNING TOTAL: ${t:.4f}")
PY
exit $RC
