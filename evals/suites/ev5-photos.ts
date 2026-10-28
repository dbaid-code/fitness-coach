// EV-5 equipment photos (evaluations.md §3). Cases live in datasets/photos/ (owner-supplied, no people).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sniffImageType, readImageDimensions, IMAGE_MEDIA_TYPES } from '@/lib/security/image-upload';
import { PHOTO_CONFIDENCE_THRESHOLD } from '@/server/agents/agent-config';
import { equipmentVisionAgent } from '@/server/agents/equipment-vision/equipment-vision.agent';
import { runAgent } from '@/server/agents/run-agent';
import { filterDetections } from '@/server/domain/equipment/photo-detections';
import { createDeadline } from '@/server/http/deadline';
import { pool, type GenDeps } from '../lib/generate';

const DIR = path.join(process.cwd(), 'evals/datasets/photos');
type Truth = { ev_id: string; setting: string; items: string[]; unclear: boolean };

export async function runEv5(deps: GenDeps) {
  const caseDirs = existsSync(DIR)
    ? readdirSync(DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];
  if (caseDirs.length === 0)
    return {
      summary: { passed: false, cases: 0, reason: 'no photo cases (owner task, datasets/photos/README.md)' },
      records: [],
    };

  const equipment = deps.ref.equipment.map((e) => ({ id: e.id, name: e.name, visualHint: e.visualHint }));
  const agent = equipmentVisionAgent({ equipment, datasetVersion: deps.ref.datasetVersion });
  const order = new Map(deps.ref.equipment.map((e) => [e.id, e.sortOrder]));
  const raw = await pool(caseDirs, 3, async (dir) => {
    const truth = JSON.parse(readFileSync(path.join(DIR, dir, 'truth.json'), 'utf8')) as Truth;
    const photos = readdirSync(path.join(DIR, dir))
      .filter((f) => /^photo-\d+\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map((f) => {
        const bytes = new Uint8Array(readFileSync(path.join(DIR, dir, f)));
        const type = sniffImageType(bytes);
        const size = type ? readImageDimensions(bytes, type) : null;
        if (!type || !size) throw new Error(`${dir}/${f}: unreadable image`);
        return { bytes, mediaType: IMAGE_MEDIA_TYPES[type], width: size.width, height: size.height };
      });
    const deadline = createDeadline(60_000);
    try {
      deps.meter.assertUnderCap();
      const r = await runAgent(
        agent,
        { photos, equipment, datasetVersion: deps.ref.datasetVersion },
        {
          requestId: truth.ev_id,
          userId: null,
          planId: null,
          mode: 'photo_scan',
          attempt: 1,
          deadline,
          log: deps.log,
        },
      );
      await r.pendingLog.write();
      return { truth, detections: r.outcome === 'ok' ? r.output.detections : [], outcome: r.outcome };
    } finally {
      deadline.dispose();
    }
  });

  const score = (threshold: number) => {
    let detected = 0;
    let wrong = 0;
    const cases = raw.map((c) => {
      const found = filterDetections(c.detections, order, threshold).map((d) => d.equipment_id);
      detected += found.length;
      const bad = found.filter((id) => !c.truth.items.includes(id));
      wrong += bad.length;
      const recall = c.truth.items.length
        ? c.truth.items.filter((i) => found.includes(i)).length / c.truth.items.length
        : 1;
      return {
        ev_id: c.truth.ev_id,
        unclear: c.truth.unclear,
        found,
        wrong: bad,
        recall,
        pass: c.truth.unclear ? found.length === 0 : recall >= 0.8,
      };
    });
    const clear = cases.filter((c) => !c.unclear);
    const unclear = cases.filter((c) => c.unclear);
    return {
      cases,
      case_pass_rate: clear.length ? clear.filter((c) => c.pass).length / clear.length : 0,
      wrong_item_rate: detected ? wrong / detected : 0,
      unclear_none: unclear.length ? unclear.filter((c) => c.pass).length / unclear.length : 0,
    };
  };
  const main = score(PHOTO_CONFIDENCE_THRESHOLD);
  const sweep = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9].map((t) => {
    const s = score(t);
    return {
      threshold: t,
      case_pass_rate: s.case_pass_rate,
      wrong_item_rate: s.wrong_item_rate,
      unclear_none: s.unclear_none,
    };
  });
  const unclearCount = main.cases.filter((c) => c.unclear).length;
  return {
    summary: {
      passed:
        caseDirs.length >= 10 &&
        unclearCount >= 2 &&
        main.case_pass_rate >= 0.9 &&
        main.wrong_item_rate <= 0.1 &&
        main.unclear_none === 1,
      cases: caseDirs.length,
      case_pass_rate: main.case_pass_rate,
      wrong_item_rate: main.wrong_item_rate,
      unclear_none: main.unclear_none,
      threshold: PHOTO_CONFIDENCE_THRESHOLD,
    },
    records: { cases: main.cases, sweep },
  };
}
