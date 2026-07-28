export type CallListStatus = 'COMPLETED' | 'FAILED';
export type CallOrigin = 'LIVE' | 'SIMULATION' | 'SYNTHETIC';

export function deriveCallListStatus(processingState: string): CallListStatus {
  return processingState.startsWith('FAILED') ? 'FAILED' : 'COMPLETED';
}

export function deriveCallOrigin(input: {
  hasReceptionistSession: boolean;
  synthetic: boolean;
}): CallOrigin {
  if (input.hasReceptionistSession) return 'SIMULATION';
  return input.synthetic ? 'SYNTHETIC' : 'LIVE';
}
