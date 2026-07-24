# ADR 0008: AI Provider Neutrality and Gateway

Status: Accepted

All AI execution uses `AIOSServiceGateway`. Provider contracts are code-owned, and provider HTTP/SDK types exist only in `packages/aios-adapters`. OpenAI is the first reference adapter. Direct worker/API/domain provider invocation fails architecture checks.

This adds one governed boundary but prevents provider choice, credentials, DTOs, and failure semantics from leaking into products or workflows.
