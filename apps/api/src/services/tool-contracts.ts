/**
 * The governed tool catalogue.
 *
 * Tools are **code-owned**. There is deliberately no way for an operator, a model or an
 * API caller to define a new one: a tool is a typed handler registered in
 * `tool-registry.service.ts`, and this file describes the contract each of those
 * handlers honours. Anything that could accept an arbitrary URL or method would hand
 * the voice runtime a route to an unreviewed system.
 *
 * What an operator *can* do is see the contract, see which environments it is enabled
 * in, run a contract test, and enable or disable it for an agent version.
 */

export type ToolRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type ToolVerification = 'NONE' | 'ESTABLISHES_STRONG' | 'STRONG' | 'OPERATOR_ONLY';

export type ToolContract = {
  /** Matches the key registered in the tool registry. */
  key: string;
  displayName: string;
  purpose: string;
  /** Always relative to this platform: tools never call an arbitrary external host. */
  endpoint: string;
  method: 'POST';
  inputFields: Array<{ name: string; type: string; required: boolean; description: string }>;
  outputFields: Array<{ name: string; type: string; description: string }>;
  authentication: string;
  verification: ToolVerification;
  verificationRule: string;
  risk: ToolRisk;
  /** Whether the tool changes state the business would have to undo. */
  writeLike: boolean;
  timeoutMs: number;
  /** What the receptionist says when the tool fails. Never invents a result. */
  fallbackWording: string;
  environments: Array<'development' | 'staging' | 'production'>;
  owner: string;
};

const CALLER_CONTEXT = [
  {
    name: 'park',
    type: 'string',
    required: true,
    description: 'Which park the caller is asking about',
  },
  { name: 'language', type: 'string', required: true, description: 'The caller’s language' },
];

const STANDARD_OUTPUT = [
  {
    name: 'status',
    type: 'string',
    description: 'Explicit result state; never an assumed success',
  },
  { name: 'safe_message', type: 'string', description: 'Wording the receptionist may say aloud' },
  {
    name: 'data',
    type: 'object',
    description: 'Structured result, absent when the status is not SUCCESS',
  },
];

const bearer = 'Bearer token held by the voice runtime (LOCAL_TOOL_TOKEN), never in the browser';

export const TOOL_CONTRACTS: readonly ToolContract[] = [
  {
    key: 'get_park_information',
    displayName: 'Park information',
    purpose: 'Answer a general question about a park from approved knowledge.',
    endpoint: '/v1/elevenlabs/tools/get_park_information',
    method: 'POST',
    inputFields: CALLER_CONTEXT,
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'No caller verification required — the information is public.',
    risk: 'LOW',
    writeLike: false,
    timeoutMs: 4_000,
    fallbackWording: 'I do not have that confirmed, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Knowledge team',
  },
  {
    key: 'get_opening_hours',
    displayName: 'Opening hours',
    purpose: 'State the opening hours for a park on a given date.',
    endpoint: '/v1/elevenlabs/tools/get_opening_hours',
    method: 'POST',
    inputFields: [
      ...CALLER_CONTEXT,
      {
        name: 'date',
        type: 'string',
        required: true,
        description: 'The date the caller is asking about',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'No caller verification required.',
    risk: 'LOW',
    writeLike: false,
    timeoutMs: 4_000,
    fallbackWording: 'I cannot confirm the hours for that date, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Operations team',
  },
  {
    key: 'get_rules_and_age_requirements',
    displayName: 'Rules and age requirements',
    purpose: 'State height, age and safety restrictions from approved knowledge.',
    endpoint: '/v1/elevenlabs/tools/get_rules_and_age_requirements',
    method: 'POST',
    inputFields: CALLER_CONTEXT,
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'No caller verification required.',
    risk: 'MEDIUM',
    writeLike: false,
    timeoutMs: 4_000,
    fallbackWording: 'I cannot confirm the safety requirements, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Safety team',
  },
  {
    key: 'get_packages_and_pricing',
    displayName: 'Packages and pricing',
    purpose: 'State approved prices. Never quotes a figure that is not in approved knowledge.',
    endpoint: '/v1/elevenlabs/tools/get_packages_and_pricing',
    method: 'POST',
    inputFields: CALLER_CONTEXT,
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'No caller verification required.',
    risk: 'MEDIUM',
    writeLike: false,
    timeoutMs: 4_000,
    fallbackWording: 'I cannot confirm that price, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Commercial team',
  },
  {
    key: 'lookup_customer',
    displayName: 'Match the caller',
    purpose: 'Match an inbound number to a customer record. Discloses nothing on its own.',
    endpoint: '/v1/elevenlabs/tools/lookup_customer',
    method: 'POST',
    inputFields: [
      { name: 'caller_id', type: 'string', required: true, description: 'The inbound number' },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'A match alone never permits disclosure of protected details.',
    risk: 'HIGH',
    writeLike: false,
    timeoutMs: 5_000,
    fallbackWording: 'I could not find your details, so I will take them now.',
    environments: ['development', 'staging', 'production'],
    owner: 'Customer systems team',
  },
  {
    key: 'verify_customer',
    displayName: 'Verify the caller',
    purpose: 'Establish strong verification before any protected detail is disclosed.',
    endpoint: '/v1/elevenlabs/tools/verify_customer',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      {
        name: 'customer_id',
        type: 'string',
        required: true,
        description: 'The matched customer record',
      },
      { name: 'otp', type: 'string', required: true, description: 'One-time code; never stored' },
      {
        name: 'booking_reference',
        type: 'string',
        required: true,
        description: 'A second factor the caller knows',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'ESTABLISHES_STRONG',
    verificationRule: 'Creates the verification session that STRONG tools then require.',
    risk: 'HIGH',
    writeLike: true,
    timeoutMs: 6_000,
    fallbackWording: 'I could not verify you on this call, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Security team',
  },
  {
    key: 'get_upcoming_bookings',
    displayName: 'Upcoming bookings',
    purpose: 'Read a verified caller’s upcoming bookings.',
    endpoint: '/v1/elevenlabs/tools/get_upcoming_bookings',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'customer_id', type: 'string', required: true, description: 'The verified customer' },
      {
        name: 'verification_id',
        type: 'uuid',
        required: true,
        description: 'A live strong verification',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'STRONG',
    verificationRule: 'Refused without an unexpired strong verification session.',
    risk: 'HIGH',
    writeLike: false,
    timeoutMs: 6_000,
    fallbackWording: 'I cannot access your booking on this call, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Booking systems team',
  },
  {
    key: 'get_recent_support_context',
    displayName: 'Recent support context',
    purpose: 'Read a verified caller’s recent support history.',
    endpoint: '/v1/elevenlabs/tools/get_recent_support_context',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'customer_id', type: 'string', required: true, description: 'The verified customer' },
      {
        name: 'verification_id',
        type: 'uuid',
        required: true,
        description: 'A live strong verification',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'STRONG',
    verificationRule: 'Refused without an unexpired strong verification session.',
    risk: 'HIGH',
    writeLike: false,
    timeoutMs: 6_000,
    fallbackWording: 'I cannot see your previous contact, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Support systems team',
  },
  {
    key: 'check_read_only_availability',
    displayName: 'Check availability',
    purpose: 'Read availability. Explicitly read-only — it never holds or books capacity.',
    endpoint: '/v1/elevenlabs/tools/check_read_only_availability',
    method: 'POST',
    inputFields: [
      { name: 'park', type: 'string', required: true, description: 'Which park' },
      {
        name: 'activity',
        type: 'string',
        required: true,
        description: 'The activity being asked about',
      },
      { name: 'date', type: 'string', required: true, description: 'The date being asked about' },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'No verification required because nothing is reserved.',
    risk: 'MEDIUM',
    writeLike: false,
    timeoutMs: 6_000,
    fallbackWording: 'I cannot check availability right now, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Booking systems team',
  },
  {
    key: 'create_registration_link',
    displayName: 'Send a registration link',
    purpose: 'Send a single-use link so the caller can submit their own details.',
    endpoint: '/v1/elevenlabs/tools/create_registration_link',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'language', type: 'string', required: true, description: 'Language for the link' },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'The link collects details; it never creates an account itself.',
    risk: 'MEDIUM',
    writeLike: true,
    timeoutMs: 6_000,
    fallbackWording: 'I could not send that link, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Customer systems team',
  },
  {
    key: 'create_booking_link',
    displayName: 'Send a booking link',
    purpose: 'Send a link so the caller completes a booking themselves.',
    endpoint: '/v1/elevenlabs/tools/create_booking_link',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'park', type: 'string', required: true, description: 'Which park' },
      { name: 'language', type: 'string', required: true, description: 'Language for the link' },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'NONE',
    verificationRule: 'Requires strong verification because it references the caller’s record.',
    risk: 'HIGH',
    writeLike: true,
    timeoutMs: 6_000,
    fallbackWording: 'I could not send that link, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Booking systems team',
  },
  {
    key: 'create_staff_task',
    displayName: 'Raise a staff task',
    purpose: 'Raise work for a team when the receptionist cannot resolve the call.',
    endpoint: '/v1/elevenlabs/tools/create_staff_task',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'reason', type: 'string', required: true, description: 'Why the task is needed' },
      { name: 'priority', type: 'string', required: true, description: 'NORMAL or URGENT' },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'OPERATOR_ONLY',
    verificationRule: 'No verification required; the task carries no protected detail.',
    risk: 'LOW',
    writeLike: true,
    timeoutMs: 5_000,
    fallbackWording: 'I could not log that, so I will arrange a callback.',
    environments: ['development', 'staging', 'production'],
    owner: 'Operations team',
  },
  {
    key: 'request_callback',
    displayName: 'Request a callback',
    purpose: 'Promise the caller a call back, and record that promise as work.',
    endpoint: '/v1/elevenlabs/tools/request_callback',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'reason', type: 'string', required: true, description: 'What the callback is about' },
      { name: 'priority', type: 'string', required: true, description: 'NORMAL or URGENT' },
      {
        name: 'verification_id',
        type: 'uuid',
        required: true,
        description: 'A live strong verification',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'STRONG',
    verificationRule: 'No verification required.',
    risk: 'MEDIUM',
    writeLike: true,
    timeoutMs: 5_000,
    fallbackWording: 'I could not arrange that callback, so please contact us directly.',
    environments: ['development', 'staging', 'production'],
    owner: 'Operations team',
  },
  {
    key: 'record_preferred_language',
    displayName: 'Record preferred language',
    purpose: 'Note the verified caller’s language preference for future contact.',
    endpoint: '/v1/elevenlabs/tools/record_preferred_language',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'customer_id', type: 'string', required: true, description: 'The verified customer' },
      { name: 'language', type: 'string', required: true, description: 'The preferred language' },
      {
        name: 'verification_id',
        type: 'uuid',
        required: true,
        description: 'A live strong verification',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'STRONG',
    verificationRule: 'No verification required.',
    risk: 'LOW',
    writeLike: true,
    timeoutMs: 4_000,
    fallbackWording: 'I could not save that preference, but I have noted it on this call.',
    environments: ['development', 'staging', 'production'],
    owner: 'Customer systems team',
  },
  {
    key: 'prepare_handoff_context',
    displayName: 'Prepare a handoff',
    purpose: 'Assemble the approved context a person receives when a call is transferred.',
    endpoint: '/v1/elevenlabs/tools/prepare_handoff_context',
    method: 'POST',
    inputFields: [
      {
        name: 'conversation_id',
        type: 'uuid',
        required: true,
        description: 'The live conversation',
      },
      { name: 'park', type: 'string', required: true, description: 'Which park' },
      { name: 'language', type: 'string', required: true, description: 'The caller language' },
      {
        name: 'intent',
        type: 'string',
        required: true,
        description: 'Why the call is being transferred',
      },
      {
        name: 'verification_state',
        type: 'string',
        required: true,
        description: 'Whether the caller was verified',
      },
    ],
    outputFields: STANDARD_OUTPUT,
    authentication: bearer,
    verification: 'OPERATOR_ONLY',
    verificationRule: 'The result is delivered to the operator, never read aloud to the caller.',
    risk: 'MEDIUM',
    writeLike: false,
    timeoutMs: 5_000,
    fallbackWording: 'I am transferring you now.',
    environments: ['development', 'staging', 'production'],
    owner: 'Operations team',
  },
] as const;

export function findToolContract(key: string): ToolContract | undefined {
  return TOOL_CONTRACTS.find((contract) => contract.key === key);
}
