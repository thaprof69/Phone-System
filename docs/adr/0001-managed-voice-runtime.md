# ADR 0001: ElevenLabs is the exclusive live voice runtime

Status: Accepted · 2026-07-22

Quantum Parks will not implement telephony termination, media transport, speech recognition, speech synthesis, turn-taking, or live conversation orchestration. ElevenLabs executes calls and receives only published runtime copies. The application owns the control, evidence, intelligence, and operating planes. Architecture fitness checks reject forbidden runtime components.

Consequences: provider outages affect live calls; supported provider capabilities must be measured explicitly; simulator success cannot prove production availability.
