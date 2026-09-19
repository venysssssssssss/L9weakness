#!/usr/bin/env bash
# Probe NVIDIA Build models: JSON compliance (PT-BR) + latency. Needs NVIDIA_API_KEY in env or discord-bot/.env.
# Uso: scripts/probe-models.sh [model ...]   (default: candidatos do spec)
set -u
cd "$(dirname "$0")/.."
[ -z "${NVIDIA_API_KEY:-}" ] && NVIDIA_API_KEY=$(grep -E '^NVIDIA_API_KEY=' discord-bot/.env | cut -d= -f2-)
BASE=${NVIDIA_BASE_URL:-https://integrate.api.nvidia.com/v1}
MODELS=("$@")
[ ${#MODELS[@]} -eq 0 ] && MODELS=(moonshotai/kimi-k3 nvidia/nemotron-3-super-120b-a12b z-ai/glm-5.3 deepseek-ai/deepseek-v4-flash-0731 mistralai/mistral-large-2-instruct z-ai/glm-5.3-flash nvidia/nemotron-3.5-lightning-30b-a3b nvidia/nemotron-nano-3-30b-a3b openai/gpt-oss-20b)
SYS='Responda somente um objeto JSON válido, sem markdown: {"action":"reply","text":"<resposta em português brasileiro, 1 frase>"}'
Q=("Qual a capital do Brasil?" "Explique em uma frase o que é um buraco negro." "oi")
printf '%-45s %-8s %-8s %-8s %s\n' model ok/3 p50s max_s sample
for m in "${MODELS[@]}"; do
  ok=0; ts=(); sample=""
  for q in "${Q[@]}"; do
    body=$(python3 -c 'import json,sys;print(json.dumps({"model":sys.argv[1],"messages":[{"role":"system","content":sys.argv[2]},{"role":"user","content":sys.argv[3]}],"temperature":0.3,"max_tokens":1500,"stream":False}))' "$m" "$SYS" "$q")
    t0=$(date +%s.%N)
    raw=$(curl -s -m 60 -H "Authorization: Bearer $NVIDIA_API_KEY" -H 'Content-Type: application/json' -d "$body" "$BASE/chat/completions")
    t=$(python3 -c "print(round($(date +%s.%N)-$t0,1))"); ts+=("$t")
    txt=$(printf '%s' "$raw" | python3 -c '
import json,sys,re
try:
    d=json.load(sys.stdin); c=d["choices"][0]["message"].get("content") or ""
except Exception as e:
    print("ERR "+str(sys.stdin.read())[:60]); sys.exit()
c=re.sub(r"<think>.*?</think>","",c,flags=re.S).strip()
c=re.sub(r"^```(?:json)?|```$","",c.strip(),flags=re.M).strip()
m=re.search(r"\{.*\}",c,re.S)
try:
    j=json.loads(m.group(0)); print("OK "+j.get("text","")[:50].replace("\n"," "))
except Exception: print("BAD "+c[:50].replace("\n"," "))')
    [[ $txt == OK* ]] && ok=$((ok+1)) && sample=${txt#OK }
    [[ $txt != OK* ]] && sample="$txt"
  done
  sorted=$(printf '%s\n' "${ts[@]}" | sort -n); p50=$(echo "$sorted" | sed -n 2p); mx=$(echo "$sorted" | tail -1)
  printf '%-45s %-8s %-8s %-8s %s\n' "$m" "$ok/3" "$p50" "$mx" "${sample:0:60}"
done
