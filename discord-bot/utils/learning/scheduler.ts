import cron from 'node-cron';
import { getOrchestrator } from './Orchestrator';

let scheduled = false;

export function startLearningScheduler(): void {
  if (scheduled) {
    console.log('[Scheduler] Já agendado');
    return;
  }

  const enabled = (process.env.LEARNING_ENABLED || 'true').toLowerCase() !== 'false';
  if (!enabled) {
    console.log('[Scheduler] LEARNING_ENABLED=false, scheduler desabilitado');
    return;
  }

  // Default: 6 slots/day x LEARNING_DURATION_MIN (10) = 60 min spread over the day. Legacy LEARNING_START_HOUR still honored.
  const legacy = process.env.LEARNING_START_HOUR ? `${parseInt(process.env.LEARNING_START_MINUTE || '0', 10)} ${parseInt(process.env.LEARNING_START_HOUR, 10)} * * *` : null;
  const cronExpr = process.env.LEARNING_CRON || legacy || '0 */4 * * *';
  const finalExpr = cron.validate(cronExpr) ? cronExpr : '0 */4 * * *';
  if (finalExpr !== cronExpr) console.error(`[Scheduler] Cron inválido: ${cronExpr}, usando ${finalExpr}`);

  console.log(`[Scheduler] 📅 Aprendizado em cron "${finalExpr}" UTC, ${process.env.LEARNING_DURATION_MIN || 10} min por slot`);

  cron.schedule(finalExpr, async () => {
    console.log(`[Scheduler] ⏰ Disparando aprendizado diário agendado ${new Date().toISOString()}`);
    try {
      const orch = getOrchestrator();
      if (orch.isActive()) {
        console.warn('[Scheduler] Já está aprendendo, pulando agendamento');
        return;
      }
      await orch.runOneHour();
      console.log('[Scheduler] ✅ Aprendizado diário concluído');
    } catch (e: any) {
      console.error('[Scheduler] Erro no aprendizado agendado:', e.message);
    }
  }, {
    timezone: 'UTC',
  });

  // Also run once on startup after 30s if no learning today (for dev convenience) - optional via env
  const runOnStartup = (process.env.LEARNING_RUN_ON_STARTUP || 'false').toLowerCase() === 'true';
  if (runOnStartup) {
    setTimeout(async () => {
      console.log('[Scheduler] 🚀 LEARNING_RUN_ON_STARTUP=true, iniciando aprendizado de aquecimento (2 min)');
      try {
        const orch = getOrchestrator();
        await orch.runTest(2);
        console.log('[Scheduler] ✅ Aquecimento concluído');
      } catch (e: any) {
        console.error('[Scheduler] Erro aquecimento:', e.message);
      }
    }, 30_000);
  }

  scheduled = true;

  // Heartbeat for visibility
  setInterval(() => {
    const orch = getOrchestrator();
    if (orch.isActive()) {
      console.log('[Scheduler] 💓 Learning ainda ativo...');
    }
  }, 5 * 60 * 1000);
}

export function triggerManualLearning(minutes = 60): Promise<any> {
  const orch = getOrchestrator();
  if (orch.isActive()) throw new Error('Já está aprendendo, aguarde terminar');
  console.log(`[Scheduler] Manual trigger ${minutes}min`);
  return orch.runForDuration(minutes);
}
