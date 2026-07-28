export function shouldRecordProviderTranscriptEvent(
  mode: 'VOICE' | 'TEXT',
  role: 'user' | 'agent',
): boolean {
  return role === 'agent' || mode === 'VOICE';
}
