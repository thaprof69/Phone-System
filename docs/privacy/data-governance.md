# Data Governance

- Raw webhook evidence is `RESTRICTED`, immutable, checksum-addressed, encrypted, and never the normal review view.
- Provider transcript and analysis remain provider evidence/metadata. Canonical and redacted transcript revisions are local records with lineage.
- Call summaries/classifications are versioned and evidence-linked. Corrections append revisions; raw evidence is never edited.
- Customer, booking, and support snapshots contain the minimum fields permitted at call time and do not rewrite when source systems change.
- Audio is disabled. Model training on calls is disabled. OpenAI enrichment is optional and must pass model/data-processing approval.
- Retention, deletion, export, and legal hold are gated until approved production policies and IAM/KMS controls exist.
- Europe/Lisbon is display time only; database timestamps are authoritative UTC.
