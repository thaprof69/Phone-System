# AI Provider Credential Security

AI credentials are separate from ElevenLabs credentials. Test requests use an ephemeral credential and do not persist it. A five-minute HMAC-bound proof is required before save. Saved values use AES-256-GCM with provider/reference/key-version AAD and a separately mounted master key.

Browser responses, model records, status, audit, events, errors, logs, and configuration JSON expose only generated references such as `AI-OPENAI-7F21ABCD`. Credential rotation and disconnect revoke references without deleting AIOS history. Only the hosted AIOS implementation decrypts credentials.
