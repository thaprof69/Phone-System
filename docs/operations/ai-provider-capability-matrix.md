# AI Provider Capability Matrix

| Provider                                         | Adapter                           | Structured output         | Model discovery           | Embeddings  | Production                                                       |
| ------------------------------------------------ | --------------------------------- | ------------------------- | ------------------------- | ----------- | ---------------------------------------------------------------- |
| OpenAI                                           | Implemented reference adapter     | Responses API JSON Schema | `GET /v1/models`          | Implemented | Requires credential, model/region/governance/evaluation approval |
| Simulator                                        | Implemented deterministic adapter | Supported synthetic       | Fixed synthetic catalogue | Unsupported | Forbidden                                                        |
| Anthropic/Gemini/Azure/Bedrock/OpenAI-compatible | Not registered                    | Unsupported               | Unsupported               | Unsupported | Unsupported                                                      |

Capability truth is local and evidence-backed. An unimplemented adapter is never represented as supported.
