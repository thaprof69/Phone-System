# Admin User Guide

Daily work is performed in Quantum Parks Operations:

- Overview: provider/pipeline health, work queues, drift and activation blockers.
- Agent Studio: draft immutable configurations, review diffs, attach tests/approvals, publish and roll back.
- Knowledge Hub: author/version content, set owner/effective dates, review, publish, withdraw and resolve gaps.
- Voice Library: discover API-supported voices, preview, approve and assign. Custom voice remains disabled.
- Test Studio: author suites, map provider tests, run repetitions, review evidence and release gates.
- Calls: review redacted canonical history, intelligence, trusted outcomes, corrections and audit.
- Operations: own callbacks, tasks, handoffs, message receipts and SLA escalation.
- Analytics/Reports: use aggregates and governed exports, not ad-hoc raw transcript scans.
- Administration: provider capabilities, integrations, identity, retention, audit and readiness.

Never use the ElevenLabs console for routine work. Restricted console activity must be recorded as a capability exception.

## Connecting ElevenLabs

Open **Administration → Integrations → ElevenLabs**. Choose **Connect**, enter a restricted API key, label the connection, and select Sandbox or Production. Test the connection first; Save remains unavailable until the server verifies provider identity plus agent and voice discovery.

The key is sent only to the Quantum Parks server, encrypted with the provider credential vault, and replaced in the UI by a safe reference. It is not recoverable from the UI. Use Manage to re-test, update defaults, rotate the key, or disconnect. Disconnect preserves all agents, releases, transcripts, intelligence, audit events, and provider mappings and performs no destructive provider API call.

Connecting ElevenLabs does not approve production, enable telephone routing, or clear any readiness blocker.
