// fileLogSink (evaluations.md §1): agent log rows go to JSONL in the run folder, never to a database.
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { AgentLogSink } from '@/server/agents/run-agent';

export class CostMeter {
  usd = 0;
  calls = 0;
  constructor(private readonly abortAboveUsd: number) {}
  add(usd: number) {
    this.usd += usd;
    this.calls += 1;
  }
  /** The runner aborts when the running cost passes the cap (evaluations.md §5). */
  assertUnderCap() {
    if (this.usd > this.abortAboveUsd)
      throw new Error(`eval run aborted: cost $${this.usd.toFixed(2)} passed the $${this.abortAboveUsd} cap`);
  }
}

export function fileLogSink(runDir: string, meter: CostMeter): AgentLogSink {
  mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, 'agent-logs.jsonl');
  return {
    async write(row, spend) {
      if (spend) meter.add(spend.costUsd);
      appendFileSync(file, `${JSON.stringify(row)}\n`);
    },
  };
}
