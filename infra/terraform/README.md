# AWS Reference Deployment

This reference provisions EU VPC isolation, private ECS Fargate services, TLS ALB routing, encrypted RDS PostgreSQL, encrypted Redis, KMS, versioned/private evidence and asset buckets, secret references, logs, and service alarms. Only digest-pinned `admin-web`, `customer-web`, `api`, and `worker` images are accepted by the input contract; the provider simulator has no production resource.

Before `apply`, supply an approved AWS role, state backend, certificate/DNS, immutable images, budgets, Cognito user-pool ARN/domain/client configuration, Temporal deployment/Cloud connection, secret values, backup policy, alert destinations, and legal/security approval. The admin listener uses `authenticate-cognito`; the API verifies the forwarded Cognito access token and maps approved Cognito groups to application roles.

Terraform creates encrypted secret containers but deliberately does not create secret versions. Populate the database URL, ElevenLabs API/webhook secrets, internal tool token, metrics token, and optional OpenAI secret through the approved secret-delivery process. Web tasks receive no backend/provider secrets. Only the API task has an application IAM role, limited to immutable raw-evidence object writes and the required KMS operations.

Terraform presence and validation are not deployment evidence.
