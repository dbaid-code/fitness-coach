import 'server-only';
import { z } from 'zod';

// AG-1 output (agent-ag1-equipment-vision.md §3). Built once per dataset version.
export const makeEquipmentVisionOutput = (activeIds: [string, ...string[]]) =>
  z
    .object({
      detections: z.array(z.object({ equipment_id: z.enum(activeIds), confidence: z.number() }).strict()).max(30),
    })
    .strict();

export type EquipmentVisionOutput = z.infer<ReturnType<typeof makeEquipmentVisionOutput>>;
