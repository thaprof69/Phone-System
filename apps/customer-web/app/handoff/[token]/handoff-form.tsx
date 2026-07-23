'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

export function HandoffForm({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(formData: FormData) {
    setState('submitting');
    setMessage('');
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch('/api/handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, token }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? 'We could not complete this request.');
      setState('success');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'We could not complete this request.');
    }
  }

  if (state === 'success')
    return (
      <div className="success-card" role="status">
        <CheckCircle2 />
        <h3>Request received</h3>
        <p>
          Your registration request was recorded. Any follow-up will be confirmed through the
          contact method you selected.
        </p>
      </div>
    );
  return (
    <form action={submit} aria-busy={state === 'submitting'}>
      <div className="field-row">
        <label>
          First name
          <input name="firstName" autoComplete="given-name" required minLength={2} />
        </label>
        <label>
          Last name
          <input name="lastName" autoComplete="family-name" required minLength={2} />
        </label>
      </div>
      <label>
        Email address
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mobile number<span className="field-hint">Include country code</span>
        <input name="phone" type="tel" autoComplete="tel" placeholder="+351" required />
      </label>
      <label>
        Preferred park
        <select name="park" required defaultValue="">
          <option value="" disabled>
            Select a park
          </option>
          <option value="lisboa">Lisboa</option>
          <option value="porto">Porto</option>
          <option value="sintra">Sintra</option>
        </select>
      </label>
      <fieldset>
        <legend>How may we contact you?</legend>
        <label className="choice">
          <input type="checkbox" name="whatsapp" value="true" />
          <span>WhatsApp</span>
        </label>
        <label className="choice">
          <input type="checkbox" name="sms" value="true" />
          <span>SMS</span>
        </label>
        <label className="choice">
          <input type="checkbox" name="emailUpdates" value="true" />
          <span>Email</span>
        </label>
      </fieldset>
      <label className="consent">
        <input type="checkbox" name="privacyConsent" value="accepted" required />
        <span>
          I have read the <a href="https://quantumparks.com/privacy">privacy notice</a> and consent
          to Quantum Parks using these details to handle this request.
        </span>
      </label>
      {state === 'error' ? (
        <p className="form-error" role="alert">
          {message}
        </p>
      ) : null}
      <button className="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Submitting securely…' : 'Review and submit'}
        <ArrowRight size={17} />
      </button>
      <p className="form-footnote">
        Submitting does not create or change a booking and does not take payment.
      </p>
    </form>
  );
}
