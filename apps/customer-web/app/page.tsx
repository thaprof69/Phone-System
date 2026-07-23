import { ArrowRight, Lock, MessageCircleMore, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="public-shell">
      <header className="public-header">
        <a className="public-brand" href="/">
          <span>QP</span>
          <strong>Quantum Parks</strong>
        </a>
        <a className="help-link" href="tel:+351000000000">
          <MessageCircleMore size={17} />
          Need help?
        </a>
      </header>
      <section className="hero-card">
        <div className="hero-copy">
          <p className="kicker">Secure digital handoff</p>
          <h1>Continue where your call left off.</h1>
          <p>
            Use the private link sent during or after your call to register, review an official
            page, or complete a secure next step.
          </p>
          <div className="security-row">
            <ShieldCheck />
            <div>
              <strong>Your call does not authorize changes</strong>
              <span>
                Bookings, payments, and account actions only happen after confirmation in the
                appropriate secure flow.
              </span>
            </div>
          </div>
        </div>
        <div className="token-card">
          <div className="token-icon">
            <Lock />
          </div>
          <h2>Open your private link</h2>
          <p>
            For your protection, this page needs the complete single-use link sent by Quantum Parks.
          </p>
          <a className="primary-action" href="https://quantumparks.com">
            Visit Quantum Parks <ArrowRight size={17} />
          </a>
          <small>
            Never share verification codes or payment details with the voice receptionist.
          </small>
        </div>
      </section>
      <footer>
        <span>© 2026 Quantum Parks</span>
        <nav aria-label="Legal">
          <a href="https://quantumparks.com/privacy">Privacy</a>
          <a href="https://quantumparks.com/terms">Terms</a>
          <a href="https://quantumparks.com/contact">Contact</a>
        </nav>
      </footer>
    </main>
  );
}
