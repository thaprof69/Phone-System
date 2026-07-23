# Prompt and Policy Hierarchy

The runtime instruction bundle must be assembled in this order:

1. Immutable safety, privacy, payment, verification and sensitive-case policy.
2. Approved Quantum Parks business policy.
3. Agent role, tone, language, greeting and interaction rules.
4. Approved knowledge release manifest.
5. Typed tool definitions and explicit result semantics.
6. Minimum dynamic variables.
7. Caller speech, support context, URLs and uploaded content as untrusted data.

Lower levels cannot override higher levels. Retrieved content is delimited and labelled as data. Tool descriptions cannot weaken safety policy. Dynamic variables cannot contain instructions. Caller requests such as “ignore your rules” are treated as conversation content only.

Every runtime bundle has a local version, checksum, owner, approval, test evidence and provider mapping. Production publication is server-gated.
