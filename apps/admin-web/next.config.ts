import type { NextConfig } from 'next';

// Every route that moved in the 2026-07-25 information-architecture rework, so a
// saved link or bookmark from before the move still resolves. Permanent (308):
// each source path has no other purpose left under the new structure.
const legacyRedirects: NextConfig['redirects'] = async () => [
  { source: '/receptionist/agents', destination: '/settings/receptionist', permanent: true },
  {
    source: '/receptionist/agents/:id',
    destination: '/settings/receptionist/:id',
    permanent: true,
  },
  { source: '/receptionist/voices', destination: '/settings/receptionist/voices', permanent: true },
  {
    source: '/receptionist/versions/compare',
    destination: '/settings/receptionist/versions/compare',
    permanent: true,
  },
  {
    source: '/receptionist/versions',
    destination: '/settings/receptionist/versions',
    permanent: true,
  },
  {
    source: '/receptionist/releases',
    destination: '/settings/receptionist/releases',
    permanent: true,
  },
  { source: '/knowledge', destination: '/settings/knowledge', permanent: true },
  {
    source: '/knowledge/library',
    destination: '/settings/knowledge/library',
    permanent: true,
  },
  { source: '/knowledge/review', destination: '/settings/knowledge/review', permanent: true },
  { source: '/knowledge/releases', destination: '/settings/knowledge/releases', permanent: true },
  { source: '/knowledge/gaps', destination: '/settings/knowledge/gaps', permanent: true },
  { source: '/knowledge/:id', destination: '/settings/knowledge/:id', permanent: true },
  {
    source: '/quality/test-cases',
    destination: '/settings/advanced/scenarios',
    permanent: true,
  },
  { source: '/quality/suites', destination: '/settings/advanced/collections', permanent: true },
  {
    source: '/quality/runs',
    destination: '/settings/advanced/provider-test-runs',
    permanent: true,
  },
  {
    source: '/quality/gates',
    destination: '/settings/advanced/release-checks',
    permanent: true,
  },
  { source: '/quality/reviews', destination: '/settings/advanced/reviews', permanent: true },
  { source: '/operations/handoffs', destination: '/calls/handoffs', permanent: true },
  { source: '/operations/callbacks', destination: '/calls/callbacks', permanent: true },
  { source: '/operations/tasks', destination: '/calls/tasks', permanent: true },
  { source: '/operations/messages', destination: '/calls/messages', permanent: true },
  { source: '/operations/sla', destination: '/calls/sla', permanent: true },
  { source: '/calls/partial', destination: '/calls/live', permanent: true },
  { source: '/intelligence/analytics', destination: '/intelligence', permanent: true },
  { source: '/intelligence/gaps', destination: '/intelligence/knowledge-gaps', permanent: true },
  { source: '/intelligence/reports', destination: '/reports', permanent: true },
  {
    source: '/administration/voice-runtime',
    destination: '/settings/ai-providers/elevenlabs',
    permanent: true,
  },
  { source: '/administration/ai', destination: '/settings/ai-routing', permanent: true },
  {
    source: '/administration/integrations',
    destination: '/settings/integrations',
    permanent: true,
  },
  {
    source: '/administration/general',
    destination: '/settings/administration/general',
    permanent: true,
  },
  {
    source: '/administration/users',
    destination: '/settings/administration/users',
    permanent: true,
  },
  {
    source: '/administration/security',
    destination: '/settings/administration/security',
    permanent: true,
  },
  {
    source: '/administration/audit',
    destination: '/settings/administration/audit',
    permanent: true,
  },
  {
    source: '/administration/retention',
    destination: '/settings/administration/retention',
    permanent: true,
  },
  {
    source: '/administration/feature-flags',
    destination: '/settings/administration/feature-flags',
    permanent: true,
  },
  {
    source: '/administration/readiness',
    destination: '/settings/administration/readiness',
    permanent: true,
  },
  {
    source: '/administration/release',
    destination: '/settings/administration/release',
    permanent: true,
  },
  // Bare /administration must resolve after the more specific rules above, or it
  // would shadow every /administration/* rewrite.
  { source: '/administration', destination: '/settings/administration', permanent: true },

  // 2026-07-26 Simulation Lab restructure: the operator-facing workflow that used to
  // live at /settings/simulation/results (a fake keyword-matched "Quantum Result" and
  // a voice-call button that never opened ElevenLabs) is replaced by the real Live
  // Receptionist Test at /settings/simulation. The QA-engineering surfaces that used
  // to sit alongside it move to Settings -> Advanced, demoted out of the primary
  // operator path but still fully functional.
  {
    source: '/settings/simulation/scenarios',
    destination: '/settings/advanced/scenarios',
    permanent: true,
  },
  {
    source: '/settings/simulation/collections',
    destination: '/settings/advanced/collections',
    permanent: true,
  },
  {
    source: '/settings/simulation/results',
    destination: '/settings/advanced/provider-test-runs',
    permanent: true,
  },
  {
    source: '/settings/simulation/release-checks',
    destination: '/settings/advanced/release-checks',
    permanent: true,
  },
  {
    source: '/settings/simulation/reviews',
    destination: '/settings/advanced/reviews',
    permanent: true,
  },
];

const config: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@quantum-parks/ui'],
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  redirects: legacyRedirects,
};
export default config;
