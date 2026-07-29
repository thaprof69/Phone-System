export const ENCYCLOPEDIA_AUDIT_MARKER = '[QUANTUM_PARKS_ENCYCLOPEDIA_AUDIT]';

export const ENCYCLOPEDIA_AUDIT_PROMPT = `${ENCYCLOPEDIA_AUDIT_MARKER}
Using only the knowledge and instructions currently available to you as the published Quantum Parks ElevenLabs agent, produce a detailed executive understanding brief for an operator.

Cover:
1. The business identity, locations, products, services and principal customer journeys you understand.
2. The core culture, service values, tone of voice and expected customer experience.
3. The standard operating procedures you understand, including bookings, opening-hours enquiries, accessibility, group or school visits, changes, refunds, incidents, lost property and human escalation.
4. Safety, privacy, verification, payment and commercial boundaries that govern your answers and actions.
5. Important information that is missing, uncertain, contradictory or insufficiently detailed.

Distinguish approved facts from inference. Do not invent missing information. Use clear headings and enough operational detail for a manager to judge whether your knowledge is complete.`;
