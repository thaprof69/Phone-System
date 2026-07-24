# Runbook: AI Provider Outage

1. Confirm AIOS provider/model/route health and normalized failure state.
2. Preserve call ingestion, redaction, search, corrections, and deterministic outcomes.
3. Permit fallback only for retryable failures and only to a fully approved route.
4. Mark required intelligence partial or failed; never synthesize success.
5. Disable the affected route if errors persist and evaluate AIOS/platform readiness.
6. Reprocess through an authorized new run after recovery; never overwrite artifacts.
