#!/bin/bash
# usage: b-gen.sh ASSET_LABEL [imagegen generate args...]
# Agent B wrapper: refuses to run once spend reaches the cap, runs imagegen,
# appends asset/model/settings/cost/running total to art/spend-levels-B.md.
ART="$(cd "$(dirname "$0")/../.." && pwd)"
LEDGER="$ART/spend-levels-B.md"
CAP=3.40   # stop margin under the $3.50 hard limit
total() { python3 - "$LEDGER" <<'PY'
import sys
t=0
for l in open(sys.argv[1]):
    p=[x.strip() for x in l.split('|')]
    if len(p)>5:
        try: t+=float(p[4])
        except: pass
print(f"{t:.6f}")
PY
}
T=$(total)
if python3 -c "import sys; sys.exit(0 if float('$T') >= $CAP else 1)"; then
  echo "BUDGET STOP: spent \$$T, cap \$$CAP"; exit 9
fi
LABEL="$1"; shift
OUT=$(python3 ~/.claude/skills/image-gen/scripts/imagegen.py generate "$@")
RC=$?
echo "$OUT"
SET=$(echo "$@" | grep -oE -- '--(quality|aspect|resolution|param|n) [^ ]+' | tr '\n' ' ')
if [ $RC -eq 0 ]; then
  read COST MODEL < <(echo "$OUT" | tail -1 | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); print(d.get("cost_usd"), d.get("model"))')
  NT=$(python3 -c "print(f'{$T + $COST:.4f}')")
  echo "| $LABEL | $MODEL | $SET | $COST | $NT |" >> "$LEDGER"
elif [ $RC -eq 3 ]; then
  echo "| $LABEL | ? | $SET | UNKNOWN (exit 3, may have billed) | $T |" >> "$LEDGER"
fi
echo "RUNNING TOTAL (B): \$$(total)"
exit $RC
