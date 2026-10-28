'use client';

import { useEffect, useState } from 'react';
import { GENERATION_STEP_LABEL_MS, STILL_WORKING_AFTER_MS } from '@/shared/constants';

/** Generation progress while a request is in flight (frontend-architecture.md §5): mount = start. */
export function useGenerationProgress(): { step: 0 | 1 | 2; stillWorking: boolean } {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [stillWorking, setStillWorking] = useState(false);
  useEffect(() => {
    const steps = setInterval(() => setStep((s) => (s < 2 ? ((s + 1) as 1 | 2) : s)), GENERATION_STEP_LABEL_MS);
    const still = setTimeout(() => setStillWorking(true), STILL_WORKING_AFTER_MS);
    return () => {
      clearInterval(steps);
      clearTimeout(still);
    };
  }, []);
  return { step, stillWorking };
}
