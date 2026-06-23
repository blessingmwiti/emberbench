type VisionProgressStatus = 'cancelling' | 'error' | 'idle' | 'loading' | 'ready' | 'running';

export function visionAnalysisProgressLabel(preprocessing: boolean, status: VisionProgressStatus) {
  if (preprocessing) return 'Preparing image locally';
  if (status === 'running') return 'Analyzing image locally';
  if (status === 'cancelling') return 'Stopping local analysis';
  return null;
}
