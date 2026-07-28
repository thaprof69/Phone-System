'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  BellRing,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Inbox,
  KeyRound,
  Mail,
  MessageCircle,
  Save,
  Send,
  ShieldCheck,
  Webhook,
} from 'lucide-react';
import { humaniseState } from '@quantum-parks/ui';
import type { CommunicationsReadiness } from '../../alerts/alerts-command-center';

type ChannelDraft = {
  emailSender: string;
  emailName: string;
  emailAudience: string;
  emailMode: string;
  whatsappNumber: string;
  whatsappBusiness: string;
  whatsappAudience: string;
  whatsappMode: string;
};

const DEFAULTS: ChannelDraft = {
  emailSender: '',
  emailName: 'Quantum Parks Operations',
  emailAudience: 'duty-managers@quantumparks.example',
  emailMode: 'APPROVAL_REQUIRED',
  whatsappNumber: '',
  whatsappBusiness: '',
  whatsappAudience: 'Duty manager rota',
  whatsappMode: 'APPROVAL_REQUIRED',
};

export function CommunicationsConsole({
  readiness,
  mode,
}: {
  readiness: CommunicationsReadiness;
  mode: 'overview' | 'email' | 'whatsapp';
}) {
  const [draft, setDraft] = useState(DEFAULTS);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    const stored = window.localStorage.getItem('qp-communications-draft');
    if (stored) setDraft({ ...DEFAULTS, ...(JSON.parse(stored) as Partial<ChannelDraft>) });
  }, []);
  function save() {
    window.localStorage.setItem('qp-communications-draft', JSON.stringify(draft));
    setSaved(true);
  }
  if (mode === 'overview') return <Overview readiness={readiness} />;
  const email = mode === 'email';
  const status = email ? readiness.gmail.status : readiness.whatsapp.status;
  return (
    <div className="communications-settings">
      <div className="communications-hero">
        <span className={status === 'CONFIGURED' ? 'ready' : ''}>
          {email ? <Mail size={24} /> : <MessageCircle size={24} />}
        </span>
        <div>
          <small>{email ? 'Google Workspace' : 'Meta Business Platform'}</small>
          <h2>{email ? 'Email channel' : 'WhatsApp channel'}</h2>
          <p>
            {email
              ? 'Shared mailbox identity for alerts and the future email receptionist.'
              : 'Shared business phone identity for alerts and the future WhatsApp receptionist.'}
          </p>
        </div>
        <b className={status === 'CONFIGURED' ? 'ready' : ''}>{humaniseState(status)}</b>
      </div>
      <div className="communications-columns">
        <section>
          <header>
            <KeyRound size={17} />
            <div>
              <strong>Connection and identity</strong>
              <span>Credentials remain server-side.</span>
            </div>
          </header>
          <div className="communications-form">
            {email ? (
              <>
                <label>
                  Approved sender mailbox
                  <input
                    value={draft.emailSender}
                    onChange={(e) => setDraft({ ...draft, emailSender: e.target.value })}
                    placeholder="operations@company.com"
                  />
                </label>
                <label>
                  Sender display name
                  <input
                    value={draft.emailName}
                    onChange={(e) => setDraft({ ...draft, emailName: e.target.value })}
                  />
                </label>
                <label>
                  Default alert recipients
                  <input
                    value={draft.emailAudience}
                    onChange={(e) => setDraft({ ...draft, emailAudience: e.target.value })}
                  />
                </label>
              </>
            ) : (
              <>
                <label>
                  Business phone number ID
                  <input
                    value={draft.whatsappNumber}
                    onChange={(e) => setDraft({ ...draft, whatsappNumber: e.target.value })}
                    placeholder="Meta phone number ID"
                  />
                </label>
                <label>
                  WhatsApp Business Account ID
                  <input
                    value={draft.whatsappBusiness}
                    onChange={(e) => setDraft({ ...draft, whatsappBusiness: e.target.value })}
                    placeholder="WABA ID"
                  />
                </label>
                <label>
                  Default alert audience
                  <input
                    value={draft.whatsappAudience}
                    onChange={(e) => setDraft({ ...draft, whatsappAudience: e.target.value })}
                  />
                </label>
              </>
            )}
            <label>
              Receptionist reply mode
              <select
                value={email ? draft.emailMode : draft.whatsappMode}
                onChange={(e) =>
                  setDraft(
                    email
                      ? { ...draft, emailMode: e.target.value }
                      : { ...draft, whatsappMode: e.target.value },
                  )
                }
              >
                <option value="MANUAL">Manual only</option>
                <option value="DRAFT_ONLY">AI drafts only</option>
                <option value="APPROVAL_REQUIRED">AI drafts · approval required</option>
                <option value="AUTOMATIC" disabled>
                  Automatic · not approved
                </option>
              </select>
            </label>
          </div>
          <div className="communications-save">
            <span>
              {saved ? (
                <>
                  <CheckCircle2 size={14} /> Draft configuration saved
                </>
              ) : (
                'Connection activates only after server-side validation.'
              )}
            </span>
            <button className="button primary small" onClick={save}>
              <Save size={15} /> Save configuration
            </button>
          </div>
        </section>
        <aside>
          <h3>Activation checklist</h3>
          {(email
            ? [
                ['OAuth application', 'Client ID, secret and approved redirect URI'],
                [
                  'Least privilege',
                  'gmail.send now; mailbox read scopes require separate approval',
                ],
                ['Inbound events', 'Gmail watch, Cloud Pub/Sub and history checkpoint'],
                ['Model routing', 'Email & Alerts capability has an approved primary and fallback'],
              ]
            : [
                ['Meta business identity', 'Business account and phone number verified'],
                ['System user token', 'Encrypted token with minimum required permissions'],
                ['Approved templates', 'Operational alert templates approved by Meta'],
                [
                  'Signed webhooks',
                  'Inbound messages and delivery receipts verified and replay-safe',
                ],
              ]
          ).map(([title, detail]) => (
            <div key={title}>
              <CircleAlert size={16} />
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
            </div>
          ))}
          <Link className="button secondary small" href="/settings/ai-providers/routing">
            <Bot size={15} /> Open model routing
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Overview({ readiness }: { readiness: CommunicationsReadiness }) {
  return (
    <div className="communications-settings">
      <div className="communications-overview-grid">
        <ChannelSummary
          icon={Mail}
          label="Email"
          status={readiness.gmail.status}
          detail={readiness.gmail.sender ?? 'No approved Gmail sender'}
          href="/settings/communications/email"
        />
        <ChannelSummary
          icon={MessageCircle}
          label="WhatsApp"
          status={readiness.whatsapp.status}
          detail={readiness.whatsapp.phoneNumberId ?? 'No Meta business phone'}
          href="/settings/communications/whatsapp"
        />
      </div>
      <section className="communications-consumers">
        <header>
          <Inbox size={18} />
          <div>
            <strong>One channel plane, multiple consumers</strong>
            <span>Identity and credentials are configured once, then governed per feature.</span>
          </div>
        </header>
        <div>
          <Link href="/alerts">
            <BellRing size={17} />
            <span>
              <strong>Operational alerts</strong>
              <small>Active consumer · human attention and escalation</small>
            </span>
            <ExternalLink size={14} />
          </Link>
          <div>
            <Send size={17} />
            <span>
              <strong>Email receptionist</strong>
              <small>Foundation ready · inbound synchronisation not active</small>
            </span>
            <b>Planned</b>
          </div>
          <div>
            <MessageCircle size={17} />
            <span>
              <strong>WhatsApp receptionist</strong>
              <small>Foundation ready · inbound webhook consumer not active</small>
            </span>
            <b>Planned</b>
          </div>
          <div>
            <Webhook size={17} />
            <span>
              <strong>Zendesk and website enquiries</strong>
              <small>Will enter the same governed inbox and approval workflow</small>
            </span>
            <b>Planned</b>
          </div>
        </div>
      </section>
      <div className="communications-policy">
        <ShieldCheck size={18} />
        <div>
          <strong>Current safety policy</strong>
          <span>Human approval required. Automatic replies and booking writes are disabled.</span>
        </div>
      </div>
    </div>
  );
}

function ChannelSummary({
  icon: Icon,
  label,
  status,
  detail,
  href,
}: {
  icon: typeof Mail;
  label: string;
  status: string;
  detail: string;
  href: string;
}) {
  return (
    <Link className="communications-summary" href={href}>
      <span>
        <Icon size={22} />
      </span>
      <div>
        <small>Shared channel</small>
        <h3>{label}</h3>
        <p>{detail}</p>
      </div>
      <b className={status === 'CONFIGURED' ? 'ready' : ''}>{humaniseState(status)}</b>
    </Link>
  );
}
