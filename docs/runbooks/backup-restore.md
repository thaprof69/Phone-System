# Runbook: Backup and restore

Production uses encrypted automated PostgreSQL backups with point-in-time recovery, versioned object storage, and independently retained audit evidence. Quarterly restore validation must create an isolated environment, restore database and evidence metadata, verify checksums and referential integrity, confirm legal holds, run canonical call queries, and destroy the isolated copy under an approved deletion record.

No local restore test is claimed: Docker is unavailable in the current engineering environment and AWS backup resources require deployment authority.
