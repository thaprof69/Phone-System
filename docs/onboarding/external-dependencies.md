# External Production Dependencies

| Dependency               | Required evidence                                                                          | Current state | Smallest unblock action                                     |
| ------------------------ | ------------------------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------- |
| ElevenLabs workspace     | EU isolated Enterprise workspace, restricted API key, ZRM, webhooks, tested capabilities   | Blocked       | Connect and verify the approved workspace in Administration |
| Telephony                | Native Twilio route, public-number forwarding, transfer destinations                       | Blocked       | Approve route and provide Twilio/ElevenLabs configuration   |
| Privacy/legal            | DPA, disclosure, retention, deletion, no-training, recording decision                      | Blocked       | Approve signed policy values and provider settings          |
| Company content          | Owned Portuguese/English facts, policies, schedules, prices, safety content                | Blocked       | Supply content owners and approved source material          |
| Languages/voices         | Native-speaker QA and approved production voices                                           | Blocked       | Provide reviewers and sign-off evidence                     |
| Human operations         | Queues, schedules, senior routes, callback SLAs, escalation contacts                       | Blocked       | Approve operational topology                                |
| Customer/booking/Zendesk | API contracts, authentication, field mappings, purpose policy                              | Blocked       | Supply sandbox contracts and credentials                    |
| Messaging                | Twilio sender identities, consent, templates, opt-out and fallback policy                  | Blocked       | Approve senders and templates                               |
| OpenAI enrichment        | Credentials, approved model allowlist, data-processing posture                             | Blocked       | Supply secret reference and governance approval             |
| AWS                      | Accounts, region approval, DNS, certificates, budgets, deployment authority                | Blocked       | Supply non-production AWS role and approved domain          |
| Cognito identity         | User pool ARN/domain, app client, groups, callback URLs, access-token claims               | Blocked       | Provision the approved pool and map application roles       |
| Temporal                 | Managed endpoint, namespace, mTLS/API-key posture, network path and retention              | Blocked       | Provision an approved namespace reachable from ECS          |
| Secret values            | DB/webhook/tool/metrics secrets and provider-vault master key in versioned Secrets Manager | Blocked       | Populate versioned Secrets Manager values out of band       |
