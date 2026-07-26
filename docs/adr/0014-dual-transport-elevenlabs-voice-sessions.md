# ADR 0014: Dual-transport ElevenLabs voice sessions, honest diagnostics, and the Conversation Lifecycle authority

## Status

Accepted — 2026-07-26.

## Context

The prior port of Quantum Park Lite's Live Receptionist Test (ADR 0013) covered the operator
testing workflow, but left the **Provider configuration** half of the reference app unported.
Reading Quantum Park Lite's `/settings/phone/provider` (`ProviderCard`/`DiagnosticsCard` in
`phone-panels.tsx`, `runPhoneDiagnostics()` in `phone-setup.ts`) confirmed both halves are fake:
`runPhoneDiagnostics()` never calls ElevenLabs at all (its own comment: _"Live ElevenLabs lookup
is not enabled for this local diagnostic run"_), and its "Voice Mode: WebRTC preferred / WebSocket
fallback" field has no real backing — there is no adapter method, no endpoint, nothing behind it.

Phone-System's existing `/settings/ai-providers/elevenlabs` page was already real (genuine
`getWorkspace`/`listAgents`/`getAgent` calls), but structured as a summary page plus a
`<dialog>`-modal editor — diverging from the source's direct inline-form UX — and had no
diagnostics workflow at all.

Investigating whether "Voice Mode" could be built for real (rather than faked or dropped)
confirmed the installed `@elevenlabs/client` SDK genuinely supports two transports:
`connectionType: 'websocket'` (via a `signedUrl`, the flow already in use) and
`connectionType: 'webrtc'` (via a `conversationToken`, not yet implemented). ElevenLabs' own docs
confirmed the real endpoint: `GET /v1/convai/conversation/token?agent_id=...` →
`{ token, conversation_id }`. The user explicitly decided to build both transports for real.

## Decision

### Dual transport

`packages/elevenlabs/src/adapter.ts` gained `getConversationToken()`, calling the real endpoint
above, mirroring `getSignedConversationUrl()`'s existing request/mapping pattern exactly. A
matching deterministic stub was added to `apps/provider-simulator` so dev/CI stays fully
credential-free.

`providerIntegrations` gained a `voiceMode` column (`WEBRTC_PREFERRED` | `WEBSOCKET_ONLY`) with a
deliberately split default: the **database column default** is `WEBSOCKET_ONLY` (protects existing
rows — their behaviour must not silently change), while **new integrations created through
`connect()`** default to `WEBRTC_PREFERRED` at the application layer. These are two different
defaults at two different layers on purpose.

`platform.service.ts`'s `startVoiceSession()` now returns a discriminated union on `transport`,
choosing WebRTC only when the caller opts in (`preferWebRTC`) and the integration's `voiceMode`
allows it. **Scope decision**: there is no server-side WebRTC→WebSocket retry inside
`startVoiceSession` itself. A token-endpoint failure and a signed-url-endpoint failure share the
same auth/agent-availability failure surface — both are simple authenticated GETs against the same
provider and agent — so there is no realistic failure mode that is WebRTC-specific at the
server-to-provider layer. The real fallback need (a browser-side WebRTC/ICE/media failure _after_ a
token was successfully issued) is handled entirely client-side, one layer up. This trims real
complexity without weakening the requirement.

Text-only sessions always use WebSocket regardless of the configured voice mode — WebRTC is a
voice-transport concept only; `receptionist-session.service.ts`'s orchestration passes
`preferWebRTC: mode === 'VOICE'` down, never `TEXT`.

### Fallback stays inside one `ReceptionistSession`

A WebRTC failure must never surface as two unrelated operator sessions. `voiceSessions` gained
`transport`, `receptionistSessionId` (so a runtime row can point back to the conversation it
belongs to), `replacesVoiceSessionId` (self-referencing — chains a replacement runtime attempt to
the one it replaced), and `failureCategory`. `ConversationLifecycleService.
retryWithFallbackTransport()`: marks the failed WebRTC `voiceSessions` row `FAILED` with its
failure category _before_ anything else happens (so no two provider conversations are ever
simultaneously active), starts a new WebSocket `voiceSessions` row chained via
`replacesVoiceSessionId`, and moves the `ReceptionistSession`'s active-runtime pointer
(`voiceSessionId`) to the replacement. There remains exactly one `ReceptionistSession`, one
transcript, and one Recent Sessions entry for the whole attempt sequence — the session detail page
renders the chain as a readable sequence ("WebRTC attempted → media connection failed → failed
runtime terminated → WebSocket fallback started → conversation connected").

`voiceSessions.signedUrlExpiresAt` was renamed to `sessionExpiresAt` (a single generalized expiry
column covering both transports) rather than adding a second nullable column — simpler, and avoids
a state where both or neither expiry is populated. The conversation token itself is never
persisted, matching the pre-existing rule that the signed URL was never persisted either.

### Honest diagnostics — bootstrap is not media verification

A real token or signed-URL round trip proves server-side reachability (auth, agent accessibility,
endpoint availability) only. It must never be presented as evidence that real browser audio works.
The diagnostics grid (`elevenlabs_diagnostic_runs`, modeled after the existing
`readinessEvaluations` shape) keeps the source's 8 checks — `provider_status`, `agent_found` (a
real `getAgent()` call, never "is the ID set"), `voice_configured`, `llm_configured` (a real
non-empty `conversation_config.agent.prompt.prompt`, never inferred from "agent exists"),
`first_message_configured` (a real provider `first_message`; a local greeting override is labeled
as a local note, never a provider-verified fact), `turn_timeout` (a permanent, honest WARNING —
the ElevenLabs API genuinely does not expose this), `webrtc_available` / `websocket_fallback`
(renamed "WebRTC bootstrap" / "WebSocket bootstrap" — each its own real round trip, independently
PASS/FAIL) — plus a 9th, `fallback_policy_enabled`, shown only when `voiceMode ===
'WEBRTC_PREFERRED'`, explicitly labeled as a static config check, "verified, not exercised."

A second, entirely separate table, `elevenlabs_media_verifications`, tracks whether a _real_
browser voice session has ever actually connected and exchanged audio, per transport. It starts at
`NOT_VERIFIED` for every integration and is written only from real Simulation Lab session
lifecycle events (`onConnect`, first agent message, `onDisconnect`/end) via the hook's
`postMediaVerification()` calls to a new `/{sessionId}/media-verification` route. The diagnostics
panel renders "WebRTC bootstrap" and "WebRTC media session" (same for WebSocket) as two separate,
independently-stated facts — never merged into one green light.

The check-building logic (`buildDiagnosticChecks()` in `elevenlabs-integration.service.ts`) is
deliberately a pure function over already-resolved provider-call outcomes, with no DB or adapter
dependency, so the honesty rules above are directly unit-testable — matching this codebase's
existing convention of only unit-testing DB-independent logic (no service test in this codebase
mocks Drizzle; DB-coupled behaviour is verified against the real local stack instead).

### Conversation Lifecycle authority

Today's Simulation Lab coordination (receptionist session → voice session → transcript → evidence
→ policy → routing → Quantum Result) previously lived directly inside
`receptionist-session.service.ts`. A new `ConversationLifecycleService` is now the single
orchestration authority for this sequencing — `start()`, `attachRuntime()`,
`recordTranscriptTurn()`, `retryWithFallbackTransport()`, `recordMediaVerification()`,
`endSession()` — with `receptionist-session.service.ts` reduced to
`ReceptionistSession`-specific _reads_ only (`getSession`/`listSessions`/`listRecentSessions`/
`buildAgentInstructionsSnapshot`).

This is a scoped refactor, not a platform rewrite: it moves _where_ the existing sequencing lives
and adds one thing — event publication. Each lifecycle milestone
(`CONVERSATION_STARTED`/`TRANSCRIPT_TURN_RECEIVED`/`CONVERSATION_ENDED`/`TRANSCRIPT_FINALISED`/
`EVIDENCE_COLLECTED`/`CONVERSATION_ANALYSED`/`POLICY_EVALUATED`/`ROUTING_COMPLETED`/
`QUANTUM_RESULT_CREATED`/`CONVERSATION_COMPLETED`) is published through the **existing** `outbox_events`
table using the exact same direct-insert pattern already used in `aios-platform.service.ts` — no
new event-bus abstraction.

**Explicit non-goal, stated plainly so it is never mistaken for an oversight**: no consumer reads
these events in this task. Mission Control, Reports, Intelligence and Knowledge Gap discovery are
unchanged and still read whatever they read today. The point of publishing now, with zero
consumers, is that (a) this task's own pipeline gets one clear authority instead of scattered
sequencing across services, and (b) a future channel (WhatsApp, Zendesk, Email, SMS) has one
documented thing to call — `ConversationLifecycleService.start()` — instead of reinventing this
sequence from scratch. No channel may implement a parallel intelligence pipeline going forward.

## Consequences

- The ElevenLabs provider page (`/settings/ai-providers/elevenlabs`) is now a direct inline form —
  no modal — matching the source's un-gated UX, with the two-button "Save ElevenLabs" (persist
  only) vs "Save & test provider" (persist + real verify) pattern preserved from the existing
  `connect()`/`update()`/`verifySaved()` service methods, just relabeled and un-modaled.
- New diagnostics history page at `/settings/ai-providers/elevenlabs/diagnostics`.
- Simulation Lab gained a compact, three-fact provider readiness summary (connected? diagnostics
  status+age? agent verified?) and a "Configure ElevenLabs" link — sourced entirely from existing
  `ElevenLabsIntegrationService.status()`/`readinessSummary()` calls, not a second BLOCKED
  computation. The real session-start readiness gate remains solely inside
  `startVoiceSession`'s deployment/sync-state check.
- Real microphone capture and an actual end-to-end WebRTC media handshake are not exercisable in
  this sandboxed environment — the same documented limitation already recorded for the existing
  WebSocket voice feature (ADR 0013). Token issuance, session bootstrap, and fallback _logic_ are
  verified (adapter tests, pure-function diagnostics tests, e2e); a genuine WebRTC audio round trip
  against a real ElevenLabs agent was not.
- The full live fallback UI flow (a real WebRTC session failing mid-connection and recovering over
  WebSocket) requires a real in-sync agent deployment, which the seeded development data does not
  have — the same externally-blocked limitation already documented for live voice sessions
  generally. This was verified by code-level reasoning and direct API round trip, not by an
  automated browser test that fabricates a WebRTC failure against fixture data.
