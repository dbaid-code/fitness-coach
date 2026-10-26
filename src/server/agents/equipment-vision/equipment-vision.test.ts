import { describe, expect, it } from 'vitest';
import { equipmentVisionAgent, INSTRUCTION } from './equipment-vision.agent';

const equipment = [
  { id: 'dumbbells', name: 'Dumbbells', visualHint: 'pairs of hand weights' },
  { id: 'flat_bench', name: 'Flat bench', visualHint: 'padded bench that does not tilt' },
];
const photo = (w: number, h: number) => ({
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]),
  mediaType: 'image/jpeg' as const,
  width: w,
  height: h,
});

describe('AG-1 equipment vision definition', () => {
  const agent = equipmentVisionAgent({ equipment, datasetVersion: 'test-ag1' });

  it('AG-1: images come first, each labelled "Photo n:", then the instruction', () => {
    const content = agent.buildUserContent({
      photos: [photo(10, 10), photo(20, 20)],
      equipment,
      datasetVersion: 'test-ag1',
    });
    expect(content.map((c) => c.type)).toEqual(['text', 'image', 'text', 'image', 'text']);
    expect(content[0]).toEqual({ type: 'text', text: 'Photo 1:' });
    expect(content[2]).toEqual({ type: 'text', text: 'Photo 2:' });
    expect(content.at(-1)).toEqual({ type: 'text', text: INSTRUCTION });
  });

  it('AG-1: the schema rejects IDs outside the active list', () => {
    expect(agent.schema.safeParse({ detections: [{ equipment_id: 'dumbbells', confidence: 0.9 }] }).success).toBe(true);
    expect(agent.schema.safeParse({ detections: [{ equipment_id: 'hover_board', confidence: 0.9 }] }).success).toBe(
      false,
    );
  });

  it('AG-1: the system prompt lists every item in order with its visual hint', () => {
    const text = agent.system().text;
    expect(text).toContain('dumbbells | Dumbbells | pairs of hand weights');
    expect(text.indexOf('dumbbells |')).toBeLessThan(text.indexOf('flat_bench |'));
  });

  it('D-01: the log redaction keeps only byte counts and sizes', () => {
    const logged = agent.redactForLog({ photos: [photo(1568, 1176)], equipment, datasetVersion: 'test-ag1' });
    expect(logged).toEqual({
      photos: [{ type: 'image', bytes: 6, width: 1568, height: 1176 }],
      instruction: INSTRUCTION,
    });
  });
});
