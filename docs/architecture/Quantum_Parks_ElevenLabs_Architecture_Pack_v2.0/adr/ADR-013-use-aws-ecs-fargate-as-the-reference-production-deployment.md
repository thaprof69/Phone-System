# ADR-013: Use AWS ECS Fargate as the reference production deployment

**Status:** Proposed baseline  
**Date:** 2026-07-22  
**Decision owners:** Quantum Parks product, architecture, security, and operations

## Context

The build needs a secure, managed, EU-capable reference deployment without Kubernetes operational overhead.

## Decision

Use Terraform for WAF/ALB, ECS services, RDS, Redis, S3/KMS, Secrets Manager, IAM, telemetry, backups, and budgets.

## Consequences

Portable application contracts remain. Region and managed-service choices must be verified during implementation.

## Guardrails

- Implementation must remain traceable to PRD v2.0.
- Provider capability claims must be verified against current official documentation.
- Security, privacy, payment exclusion, and sensitive-case requirements take precedence.
- Material deviation requires a superseding ADR and updated compliance matrix.
