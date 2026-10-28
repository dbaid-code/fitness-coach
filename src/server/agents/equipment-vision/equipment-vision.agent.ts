import 'server-only';
import { imageLogStub } from '@/lib/security/redaction';
import type { ImageMediaType } from '@/lib/security/image-upload';
import type { AgentDefinition } from '../run-agent';
import { loadSystemPrompt } from '../prompt-loader';
import { makeEquipmentVisionOutput, type EquipmentVisionOutput } from './equipment-vision.schema';

// AG-1 Equipment Vision (agent-ag1-equipment-vision.md). Photos live in memory only (D-01).
export type EquipmentVisionInput = {
  photos: Array<{ bytes: Uint8Array; mediaType: ImageMediaType; width: number; height: number }>;
  equipment: Array<{ id: string; name: string; visualHint: string }>;
  datasetVersion: string;
};

export const INSTRUCTION = 'Identify the equipment visible across all photos.';
const schemas = new Map<string, ReturnType<typeof makeEquipmentVisionOutput>>();

export function equipmentVisionAgent(
  meta: Pick<EquipmentVisionInput, 'equipment' | 'datasetVersion'>,
): AgentDefinition<EquipmentVisionInput, EquipmentVisionOutput> {
  let schema = schemas.get(meta.datasetVersion);
  if (!schema) {
    schema = makeEquipmentVisionOutput(meta.equipment.map((e) => e.id) as [string, ...string[]]);
    schemas.set(meta.datasetVersion, schema);
  }
  return {
    id: 'ag1_equipment_vision',
    schema,
    system: () =>
      loadSystemPrompt(
        'ag1_equipment_vision',
        { EQUIPMENT_TABLE: meta.equipment.map((e) => `${e.id} | ${e.name} | ${e.visualHint}`).join('\n') },
        meta.datasetVersion,
      ),
    buildUserContent: (input) => [
      ...input.photos.flatMap((p, i) => [
        { type: 'text' as const, text: `Photo ${i + 1}:` },
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: p.mediaType, data: Buffer.from(p.bytes).toString('base64') },
        },
      ]),
      { type: 'text', text: INSTRUCTION },
    ],
    // Image stubs only: byte counts and dimensions (D-01, FR-24).
    redactForLog: (input) => ({
      photos: input.photos.map((p) => imageLogStub({ bytes: p.bytes.byteLength, width: p.width, height: p.height })),
      instruction: INSTRUCTION,
    }),
  };
}
