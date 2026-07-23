import { Check, ChevronLeft, Clock3, LockKeyhole, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { HandoffForm } from './handoff-form';

export default async function HandoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="flow-shell">
      <header className="public-header compact">
        <Link className="public-brand" href="/">
          <span>QP</span>
          <strong>Quantum Parks</strong>
        </Link>
        <div className="secure-label">
          <LockKeyhole size={15} />
          Secure handoff
        </div>
      </header>
      <div className="flow-grid">
        <aside className="flow-context">
          <Link href="/" className="back">
            <ChevronLeft size={16} />
            Back
          </Link>
          <p className="kicker">Your next step</p>
          <h1>Let’s keep things moving.</h1>
          <p>
            This protected form continues a request started with the Quantum Parks receptionist.
            Nothing is changed until you review and submit.
          </p>
          <ol>
            <li className="complete">
              <span>
                <Check />
              </span>
              <div>
                <strong>Call request received</strong>
                <small>Context shared with minimum necessary detail</small>
              </div>
            </li>
            <li className="active">
              <span>2</span>
              <div>
                <strong>Confirm your details</strong>
                <small>You are here</small>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Receive confirmation</strong>
                <small>Only after a trusted system result</small>
              </div>
            </li>
          </ol>
          <div className="expiry">
            <Clock3 size={18} />
            <div>
              <strong>Private and time-limited</strong>
              <span>This link expires automatically and cannot be reused after completion.</span>
            </div>
          </div>
        </aside>
        <section className="form-card">
          <div className="form-heading">
            <div className="form-shield">
              <ShieldCheck />
            </div>
            <div>
              <p className="kicker">New customer registration</p>
              <h2>Tell us how to reach you</h2>
            </div>
          </div>
          <p className="form-intro">
            We’ll use these details only to handle this request and your selected communication
            preferences.
          </p>
          <HandoffForm token={token} />
        </section>
      </div>
      <footer className="flow-footer">
        <span>Protected by Quantum Parks security controls</span>
        <nav aria-label="Legal">
          <a href="https://quantumparks.com/privacy">Privacy notice</a>
          <a href="https://quantumparks.com/contact">Get help</a>
        </nav>
      </footer>
    </main>
  );
}
