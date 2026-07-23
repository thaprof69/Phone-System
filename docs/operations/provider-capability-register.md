# Provider Capability Register

Runtime values are measured and stored as `SUPPORTED`, `UNSUPPORTED`, `ACCOUNT_RESTRICTED`, `NOT_CONFIGURED`, or `TEMPORARILY_UNAVAILABLE`.

| Capability                   | Local simulator    | Production initial state | Notes                                             |
| ---------------------------- | ------------------ | ------------------------ | ------------------------------------------------- |
| Agent versioning/branches    | SUPPORTED          | NOT_CONFIGURED           | Must verify account/API read-back                 |
| Text knowledge publication   | SUPPORTED          | NOT_CONFIGURED           | Local approval remains authoritative              |
| Voice catalogue              | SUPPORTED          | NOT_CONFIGURED           | Custom voice is ACCOUNT_RESTRICTED                |
| Agent tests/repeated runs    | SUPPORTED          | NOT_CONFIGURED           | Release evidence requires live-account validation |
| Post-call transcript webhook | SUPPORTED          | NOT_CONFIGURED           | HMAC secret and webhook health required           |
| Conversation retrieval       | SUPPORTED          | NOT_CONFIGURED           | Used for reconciliation only                      |
| Native transfer route        | NOT_CONFIGURED     | NOT_CONFIGURED           | Routing and destination evidence external         |
| EU residency                 | NOT_CONFIGURED     | NOT_CONFIGURED           | Must be verified on provisioned workspace         |
| Zero retention mode          | ACCOUNT_RESTRICTED | ACCOUNT_RESTRICTED       | Enterprise activation evidence required           |
| Audio ingestion              | UNSUPPORTED        | UNSUPPORTED              | Product policy, regardless of provider capability |

The agent-test adapter was verified on 2026-07-22 against the official create-test, run-tests, and test-invocation contracts:

- <https://elevenlabs.io/docs/api-reference/tests/create>
- <https://elevenlabs.io/docs/api-reference/tests/run-tests>
- <https://elevenlabs.io/docs/api-reference/tests/test-invocations/get>

Local test versions remain authoritative. Provider test and invocation IDs are stored only as runtime/evidence mappings.
