# Coding Agent Completion Checklist

- [ ] Governing PRD, architecture pack and ADRs were read.
- [ ] Current provider APIs/capabilities were verified using official documentation.
- [ ] No custom live voice runtime or media gateway was introduced.
- [ ] Local authoritative entities and provider mappings were used.
- [ ] External payloads are schema validated and mapped at the boundary.
- [ ] Tools are typed, authorized, purpose-limited and explicitly state outcomes.
- [ ] No browser secret or permanent provider credential is exposed.
- [ ] Hallucination, false-completion and injection controls are preserved.
- [ ] Security, payment, verification and sensitive-case boundaries are tested.
- [ ] FR/NFR traceability and architecture compliance were updated.
- [ ] Unit, integration, contract, E2E, accessibility and security tests were run.
- [ ] Provider simulator failure/duplicate/drift scenarios were exercised.
- [ ] UI was inspected for loading, empty, partial, forbidden and failure states.
- [ ] No critical TODO, fake success, skipped test or undocumented manual step remains.
- [ ] Release evidence contains actual commands and results.
- [ ] Unavailable live dependencies are marked EXTERNALLY_BLOCKED with exact unblock steps.
