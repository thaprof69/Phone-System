export type ReceptionistScenarioKey =
  | 'booking_enquiry'
  | 'pricing_question'
  | 'complaint'
  | 'refund_request'
  | 'safety_concern'
  | 'late_arrival'
  | 'availability_check'
  | 'human_callback_request';

/**
 * Preset customer messages for the Live Receptionist Test workflow, ported verbatim (keys,
 * labels, message text unchanged) from the Quantum Park Lite source — these are example
 * customer utterances, not logic, so there is nothing to replace with real infrastructure here.
 */
export const RECEPTIONIST_PRESET_SCENARIOS: Array<{
  key: ReceptionistScenarioKey;
  label: string;
  message: string;
}> = [
  {
    key: 'booking_enquiry',
    label: 'Booking enquiry',
    message: 'Hi, I want to book a birthday party next Saturday for 12 kids. Can you help?',
  },
  {
    key: 'pricing_question',
    label: 'Pricing question',
    message: 'Can you tell me the current prices for a birthday party package?',
  },
  {
    key: 'complaint',
    label: 'Complaint',
    message: 'I am really unhappy about our visit and I want to complain to someone.',
  },
  {
    key: 'refund_request',
    label: 'Refund request',
    message: 'I need a refund because we could not attend our booking.',
  },
  {
    key: 'safety_concern',
    label: 'Safety concern',
    message: 'Someone got hurt and I think the activity area was unsafe.',
  },
  {
    key: 'late_arrival',
    label: 'Late arrival',
    message: 'We are running late for our booking. What should we do now?',
  },
  {
    key: 'availability_check',
    label: 'Availability check',
    message: 'Do you have availability tomorrow at 2pm for a school group of 25?',
  },
  {
    key: 'human_callback_request',
    label: 'Human callback request',
    message: 'Can a member of staff call me back today about my enquiry?',
  },
];
