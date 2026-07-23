# ElevenLabs Official Reference Register

This register is a design reference, not a substitute for implementation-time verification. ElevenLabs endpoints, request fields, deprecations, account-tier capabilities, regions, privacy options, and telephony behaviours must be revalidated against current official documentation before use.

## Authentication and connection discovery

- API authentication (`xi-api-key`): https://elevenlabs.io/docs/api-reference/authentication
- User identity and subscription: https://elevenlabs.io/docs/api-reference/user/get
- List agents: https://elevenlabs.io/docs/api-reference/agents/list
- List voices: https://elevenlabs.io/docs/api-reference/voices/search

These contracts were revalidated on 2026-07-23 for the Administration integration. Production calls use the fixed `https://api.elevenlabs.io` base URL; client input cannot override it.

## Agent configuration and versioning
- Create agent: https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
- Agent build overview: https://elevenlabs.io/docs/eleven-agents/build/overview

## Knowledge base
- Create knowledge document from text: https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-text
- Implementation must additionally verify current file, URL, update, delete, folder, dependency, and retrieval endpoints.

## Testing
- Agent Testing overview: https://elevenlabs.io/docs/eleven-agents/customization/agent-testing
- Create test API: https://elevenlabs.io/docs/eleven-agents/api-reference/tests/create

## Personalization and tools
- Personalization overview: https://elevenlabs.io/docs/eleven-agents/customization/personalization
- Twilio inbound personalization: https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/customising-calls
- Webhook tools: https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools
- Tools overview: https://elevenlabs.io/docs/eleven-agents/customization/tools

## Post-call webhooks
- Post-call webhooks: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- General webhook resources: https://elevenlabs.io/docs/eleven-api/resources/webhooks

The ingestion schema must tolerate additive fields while retaining strict validation of required semantics, maximum size, signature, timestamp, provider identity, and replay.

## Privacy and residency
- Zero Retention Mode per agent: https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm
- Enterprise Zero Retention Mode: https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
- Data residency: https://elevenlabs.io/docs/overview/administration/data-residency

Data residency and Zero Retention Mode are separate decisions. Processing geography, optional integrations, post-call webhooks, custom LLMs, retention, audio, and support access require legal and technical validation.

## Telephony
- Native Twilio integration: https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration/
- Register call API: https://elevenlabs.io/docs/eleven-agents/api-reference/twilio/register-call

Telephone routing and transfer support depend on the selected integration pattern and must be validated with a live staging configuration before production approval.
