#!/usr/bin/env bash
set -e
# Teste rápido do sistema de aprendizado (2 min) sem esperar 1h
# Uso: ./scripts/learning-test.sh [minutos]

MINUTES="${1:-2}"
echo "🧪 Teste aprendizado ${MINUTES}min..."

cd discord-bot
node -r ts-node/register -e "
const { getOrchestrator } = require('./utils/learning/Orchestrator');
(async () => {
  const orch = getOrchestrator();
  console.log('Iniciando teste', $MINUTES, 'min');
  const res = await orch.runForDuration($MINUTES);
  console.log('Resultado:', res);
  const { getLearningStorage } = require('./utils/learning/Storage');
  const s = getLearningStorage();
  console.log('Stats:', s.getStats());
  console.log('Will:', s.loadWill());
  process.exit(0);
})();
" 2>&1 | tail -n 100
