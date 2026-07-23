# ADR 0002: Local authority and provider drift

Status: Accepted · 2026-07-22

Agent, prompt, knowledge, voice, test, tool, approval, and release records are local immutable versions. Provider identifiers are mappings on deployment/sync records. Publishing is local-to-remote, followed by read-back and checksum comparison. A mismatch creates a drift finding and blocks publication/readiness; remote values never overwrite approved local values automatically.
