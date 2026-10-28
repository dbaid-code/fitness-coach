// Eval runner (evaluations.md §5). `--smoke` ~10 cases; `--full` EV-1 – EV-5 and latest.json;
// `--suite ev3` one suite; `--fake` plumbing check with the deterministic fakes (never writes latest.json).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prepareEvalEnv } from './lib/env';

const args = process.argv.slice(2);
const fake = args.includes('--fake');
const smoke = args.includes('--smoke');
const suiteArg = args.includes('--suite') ? args[args.indexOf('--suite') + 1]?.toLowerCase() : null;
prepareEvalEnv({ fake });

const COST_CAP_USD = 8;

async function main() {
  const [
    { seedReference },
    { CostMeter, fileLogSink },
    { manifestHash },
    ev2,
    ev3,
    ev4,
    ev5,
    { AGENT_CONFIG },
    { JUDGE_MODEL },
  ] = await Promise.all([
    import('./lib/reference'),
    import('./lib/sink'),
    import('./manifest'),
    import('./suites/ev2-plan-quality'),
    import('./suites/ev3-input-guard'),
    import('./suites/ev4-health'),
    import('./suites/ev5-photos'),
    import('@/server/agents/agent-config'),
    import('./judge/judge.agent'),
  ]);
  const runId =
    new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace(/-\d{3}Z$/, 'Z') + (fake ? '-fake' : '');
  const runDir = path.join(process.cwd(), 'evals/results/runs', runId);
  mkdirSync(runDir, { recursive: true });
  const meter = new CostMeter(COST_CAP_USD);
  const deps = { ref: seedReference(), log: fileLogSink(runDir, meter), meter, now: new Date() };
  const want = (id: string) => (suiteArg ? suiteArg === id : true);
  const suites: Record<string, unknown> = {};
  const details: Record<string, unknown> = {};
  const report = () => console.log(`  cost so far: $${meter.usd.toFixed(3)} (${meter.calls} billed calls)`);

  let generations: Array<{ ev_id: string; core: { plan: unknown; outcome: string } }> = [];
  if (want('ev2') || want('ev1')) {
    console.log('EV-2 plan quality…');
    const r = await ev2.runEv2(deps, fake, { limit: smoke ? 3 : undefined });
    suites['EV-2'] = r.summary;
    details['EV-2'] = r.records.map(({ core, ...rest }) => ({ ...rest, status: core.status, plan: core.plan }));
    generations = generations.concat(r.records);
    report();
  }
  if (want('ev3')) {
    console.log('EV-3 input guard…');
    const r = await ev3.runEv3(deps, {
      only: smoke ? ['EV-3-01', 'EV-3-05', 'EV-3-08', 'EV-3-10', 'EV-3-15'] : undefined,
    });
    suites['EV-3'] = r.summary;
    details['EV-3'] = r.records;
    report();
  }
  if (want('ev4') || want('ev1')) {
    console.log('EV-4 health…');
    const r = await ev4.runEv4(deps, { limit: smoke ? 2 : undefined });
    suites['EV-4'] = r.summary;
    details['EV-4'] = r.records.map(({ core, ...rest }) => ({ ...rest, plan: core.plan }));
    generations = generations.concat(r.records);
    report();
  }
  if (want('ev1') || want('ev2') || want('ev4')) {
    // EV-1: the core only returns a plan the production validator accepted (V-1 – V-11 with the plan's own
    // context), so every generated plan passing is checked here; first-attempt pass rate is informative.
    const plans = generations.filter((g) => g.core.plan);
    suites['EV-1'] = {
      passed: plans.length > 0 && plans.length === generations.filter((g) => g.core.outcome === 'plan_ready').length,
      metric: plans.length ? 1 : 0,
      bar: 1,
      plans: plans.length,
      generation_failed: generations.length - plans.length,
    };
  }
  if (want('ev5') && !smoke) {
    console.log('EV-5 photos…');
    const r = await ev5.runEv5(deps);
    suites['EV-5'] = r.summary;
    details['EV-5'] = r.records;
    report();
  }

  const latest = {
    manifest_hash: manifestHash(),
    run_id: runId,
    ran_at: new Date().toISOString(),
    fake,
    models: {
      ag1: AGENT_CONFIG.ag1_equipment_vision.model,
      ag2: AGENT_CONFIG.ag2_input_guard.model,
      ag3: AGENT_CONFIG.ag3_workout_planner.model,
      judge: JUDGE_MODEL,
    },
    suites,
    cost_usd: Math.round(meter.usd * 100) / 100,
  };
  writeFileSync(path.join(runDir, 'results.json'), JSON.stringify({ ...latest, details }, null, 2));
  // Only a real, complete run may feed the gate.
  if (!fake && !smoke && !suiteArg) {
    writeFileSync(path.join(process.cwd(), 'evals/results/latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
    console.log('wrote evals/results/latest.json');
  }
  console.log(JSON.stringify(suites, null, 2));
  console.log(`run folder: ${path.relative(process.cwd(), runDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
