# AIOS RBAC Matrix

`AI_INTELLIGENCE_ADMIN` manages providers, credentials, health, routes, services, context, pipelines, and replay. `AI_GOVERNANCE_APPROVER` approves models, prompts, schemas, taxonomies, evaluations, and production eligibility. `PLATFORM_OWNER` retains emergency authority. Authoring and production approval must be separate in production operating procedure.

Backend permissions use the `administration.ai.*` namespace. `aios.execute` is limited to approved workload roles and purpose. UI visibility never substitutes for backend authorization.
