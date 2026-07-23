# Hallucination Control Standard

## Stable facts
Company facts such as hours, prices, packages, ages, policies and processes must be grounded in an active, approved, effective knowledge version. A fact without qualifying evidence is not returned as certain.

## Dynamic facts
Availability, customer identity, bookings, support cases, message delivery, transfer result and action completion require a trusted system/tool event. The model may not infer them from conversation text.

## Action claims
The agent and post-call summary may use completed-action language only after a trusted result is `SUCCESS`. Requests, attempts and queued work use distinct wording.

## Structured output
Intent, entities, summaries, classifications, recommendations and next steps use code-owned schemas. Consequential claims include evidence references. Unknown fields and malformed output are rejected.

## Injection resistance
Caller speech, retrieved knowledge, webpages, support tickets and uploaded documents are untrusted data. They cannot define tools, change the policy hierarchy, request secrets or alter authorization.

## Improvement loop
Calls may create knowledge gaps or recommendations. They may not directly update prompts, knowledge or tools. A human-authored change follows review, approval, tests and publication.

## Quality review
Low-quality transcripts, unsupported claims, sensitive calls, unusual tool usage and low-confidence classifications enter a review queue. Corrections are versioned and attributed.
