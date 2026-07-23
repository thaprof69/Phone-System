const numberWords: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  zero_pt: '0',
  um: '1',
  uma: '1',
  dois: '2',
  duas: '2',
  tres: '3',
  três: '3',
  quatro: '4',
  cinco: '5',
  seis: '6',
  sete: '7',
  oito: '8',
  nove: '9',
};

export interface RedactionResult {
  text: string;
  paymentDataDetected: boolean;
  detectionCount: number;
}

export function luhnValid(value: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    let digit = Number(value[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return value.length >= 13 && value.length <= 19 && sum % 10 === 0;
}

export function redactPaymentData(input: string): RedactionResult {
  let count = 0;
  let text = input.replace(/(?:\d[\s.-]?){13,19}/g, (candidate) => {
    const digits = candidate.replace(/\D/g, '');
    if (!luhnValid(digits)) return candidate;
    count += 1;
    return '[PAYMENT_DATA_REDACTED]';
  });

  text = text.replace(/(?:\b[\p{L}]+\b[\s,.-]*){13,24}/giu, (candidate) => {
    const words = candidate.toLowerCase().match(/[\p{L}]+/gu) ?? [];
    const digits = words
      .map((word) => numberWords[word])
      .filter((value): value is string => value !== undefined)
      .join('');
    if (!luhnValid(digits)) return candidate;
    count += 1;
    return '[PAYMENT_DATA_REDACTED]';
  });

  return { text, paymentDataDetected: count > 0, detectionCount: count };
}

export function redactSensitiveToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const restricted = new Set(['otp', 'booking_reference', 'verification_code', 'payment_data']);
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      restricted.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  );
}
