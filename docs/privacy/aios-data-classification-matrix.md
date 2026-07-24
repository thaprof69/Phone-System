# AIOS Data Classification Matrix

| Data                                       | Classification          | Provider eligibility                      |
| ------------------------------------------ | ----------------------- | ----------------------------------------- |
| Capability/service/route metadata          | Internal                | Yes                                       |
| Redacted transcript turn                   | Confidential            | Only under approved context policy        |
| Unredacted transcript/payment data         | Restricted              | No in initial scope                       |
| Verified customer/booking/support snapshot | Confidential/Restricted | Only explicit source contract and policy  |
| Prompt policy text                         | Internal/Confidential   | Execution only; restricted administration |
| Credential/raw provider body               | Restricted              | Never in normal events/UI/audit           |
| Evidence manifest metadata                 | Internal/Confidential   | Persist references; avoid raw duplication |
