import { redirect } from 'next/navigation';

export default function AiProvidersIndexPage() {
  redirect('/settings/ai-providers/elevenlabs');
}
