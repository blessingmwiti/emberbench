import { describe, expect, it } from 'vitest';

import { visionAnalysisProgressLabel } from './progress';

describe('Vision Desk progress labels', () => {
  it('labels preprocessing before runtime states', () => {
    expect(visionAnalysisProgressLabel(true, 'running')).toBe('Preparing image locally');
  });

  it('labels active inference and cancellation', () => {
    expect(visionAnalysisProgressLabel(false, 'running')).toBe('Analyzing image locally');
    expect(visionAnalysisProgressLabel(false, 'cancelling')).toBe('Stopping local analysis');
  });

  it('does not show an inference progress label for idle model states', () => {
    expect(visionAnalysisProgressLabel(false, 'idle')).toBeNull();
    expect(visionAnalysisProgressLabel(false, 'loading')).toBeNull();
    expect(visionAnalysisProgressLabel(false, 'ready')).toBeNull();
  });
});
