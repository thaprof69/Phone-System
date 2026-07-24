# ADR 0010: Versioned AIOS Governance and Events

Status: Accepted

Capabilities, services, pipelines, context policies, routes, prompts, schemas, and taxonomies use immutable versions. Generated artifacts never overwrite historical intelligence. AIOS emits versioned domain events through the PostgreSQL transactional outbox, with correlation, causation, actor, purpose, classification, and safe payload.

Interactive administration reads projections; cross-context integration consumes events rather than polling authoritative state.
