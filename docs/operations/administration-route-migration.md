# Administration route migration

The canonical Administration routes are:

```text
/administration
/administration/settings
/administration/settings/general
/administration/settings/voice-runtime
/administration/settings/ai-intelligence
/administration/settings/ai-intelligence/providers
/administration/settings/ai-intelligence/capabilities
/administration/settings/ai-intelligence/execution
/administration/settings/ai-intelligence/governance
/administration/settings/ai-intelligence/monitoring
/administration/settings/knowledge
/administration/settings/policies
/administration/settings/feature-flags
/administration/readiness
/administration/security
/administration/integrations
/administration/audit
/administration/release
```

The legacy `/administration/ai-intelligence` route issues a server redirect to the canonical AI
Intelligence settings page. Configuration is not duplicated at the legacy route.

ElevenLabs is configured only in Settings → Voice Runtime. AI model providers are configured only
in Settings → AI Intelligence → Providers.
