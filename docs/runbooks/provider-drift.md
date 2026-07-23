# Runbook: Provider drift

1. Freeze publication and rollout for the mapped release.
2. Read the remote agent/branch/version and compute the canonical provider checksum.
3. Create path-level drift findings without importing remote state into approved local versions.
4. Determine whether the provider edit was authorized. Either republish an approved local release or create a new local draft and full review trail.
5. Read back again, close findings with evidence, rerun mandatory tests, and re-evaluate readiness.
