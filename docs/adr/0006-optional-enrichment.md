# ADR 0006: Optional, replaceable enrichment

Status: Accepted · 2026-07-22

`EnrichmentProvider` has deterministic-local and OpenAI Responses implementations. Model selection is configuration, not code. OpenAI capability is checked before production use and `store:false` is requested. Failure yields partial processing and retryable enhanced intelligence; it never rolls back raw evidence, provider transcript, canonical transcript, redaction, searchability, or deterministic outcomes.
