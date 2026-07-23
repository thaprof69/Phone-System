# Typed Tool Contract Standard

Every ElevenLabs webhook tool must define:

- Stable registry key and version.
- Business purpose and allowed intents.
- Input and output JSON schemas with `additionalProperties: false` where practical.
- Authentication/signature requirements.
- Verification level: NONE, LIGHT, STRONG or OPERATOR_ONLY.
- Minimum data fields and data classification.
- Timeout, rate limit, circuit breaker and retry policy.
- Idempotency rule for writes.
- Explicit result union: SUCCESS, NOT_FOUND, AMBIGUOUS, UNAUTHORIZED, VALIDATION_FAILED, RATE_LIMITED, TIMEOUT, UNAVAILABLE, CAPABILITY_UNSUPPORTED or FAILURE.
- Safe caller wording for each non-success state.
- Audit event and correlation requirements.
- Contract, security and journey tests.

No tool accepts arbitrary URLs, SQL, code, prompt fragments, raw provider credentials or payment-card data. No tool returns more personal data than the current purpose requires.
