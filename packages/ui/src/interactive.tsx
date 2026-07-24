'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixDropdownMenu from '@radix-ui/react-dropdown-menu';
import * as RadixTabs from '@radix-ui/react-tabs';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { useId, useState, type ReactNode } from 'react';

/* ---------------------------------------------------------------- in-page tabs */

export type TabPanel = { value: string; label: string; content: ReactNode; badge?: ReactNode };

/**
 * Genuine in-page tabs: the panels live in this document and no navigation occurs.
 * When each tab is a distinct URL use `RouteTabs` from `navigation.tsx` instead.
 */
export function Tabs({
  panels,
  defaultValue,
  label,
}: {
  panels: readonly TabPanel[];
  defaultValue?: string;
  label: string;
}) {
  const first = panels[0]?.value;
  if (!first) return null;
  return (
    <RadixTabs.Root className="tabs-root" defaultValue={defaultValue ?? first}>
      <RadixTabs.List className="tabs-list" aria-label={label}>
        {panels.map((panel) => (
          <RadixTabs.Trigger className="tabs-trigger" key={panel.value} value={panel.value}>
            {panel.label}
            {panel.badge !== undefined ? <span className="tabs-badge">{panel.badge}</span> : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {panels.map((panel) => (
        <RadixTabs.Content className="tabs-content" key={panel.value} value={panel.value}>
          {panel.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

/* --------------------------------------------------------------------- dialog */

export function Dialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  wide = false,
}: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wide?: boolean;
}) {
  const controlled = open !== undefined && onOpenChange !== undefined ? { open, onOpenChange } : {};
  return (
    <RadixDialog.Root {...controlled}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className={wide ? 'dialog-content wide' : 'dialog-content'}>
          <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="dialog-description">
              {description}
            </RadixDialog.Description>
          ) : (
            // Radix warns when a dialog has no description; an explicit hidden one
            // keeps the announcement clean without inventing visible copy.
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="dialog-body">{children}</div>
          <RadixDialog.Close asChild>
            <button className="dialog-close" type="button" aria-label="Close dialog">
              ×
            </button>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * Two-step confirmation for irreversible or outward-facing actions.
 * `confirmationPhrase` forces the operator to type an exact value for the most
 * destructive operations, such as disconnecting a provider.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmationPhrase,
  tone = 'danger',
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmationPhrase?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const ready = confirmationPhrase ? typed.trim() === confirmationPhrase : true;

  async function confirm() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
      setTyped('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped('');
      }}
    >
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="dialog-content confirm">
          <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
          <RadixDialog.Description className="dialog-description">
            {description}
          </RadixDialog.Description>
          {confirmationPhrase ? (
            <div className="field">
              <label htmlFor={inputId}>
                Type <code>{confirmationPhrase}</code> to continue
              </label>
              <input
                id={inputId}
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
          ) : null}
          <div className="dialog-actions">
            <RadixDialog.Close asChild>
              <button className="button ghost" type="button">
                {cancelLabel}
              </button>
            </RadixDialog.Close>
            <button
              className={`button ${tone}`}
              type="button"
              disabled={!ready || busy}
              onClick={() => {
                void confirm();
              }}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/**
 * A side panel for focused editing. Built on Dialog so focus trapping, escape
 * handling and scroll locking are handled once.
 */
export function Drawer({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const controlled = open !== undefined && onOpenChange !== undefined ? { open, onOpenChange } : {};
  return (
    <RadixDialog.Root {...controlled}>
      {trigger ? <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger> : null}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="drawer-content">
          <header className="drawer-header">
            <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button className="dialog-close" type="button" aria-label="Close panel">
                ×
              </button>
            </RadixDialog.Close>
          </header>
          {description ? (
            <RadixDialog.Description className="dialog-description">
              {description}
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          <div className="drawer-body">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/* -------------------------------------------------------------------- tooltip */

export function InfoTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={200}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>
          <button type="button" className="info-tooltip-trigger" aria-label={label}>
            {children}
          </button>
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="tooltip-content" sideOffset={6}>
            {label}
            <RadixTooltip.Arrow className="tooltip-arrow" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

/* -------------------------------------------------------------------- actions */

export type MenuAction = {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
};

/** Row-level action menu. Keyboard navigation and focus return come from Radix. */
export function ActionMenu({ label, actions }: { label: string; actions: readonly MenuAction[] }) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>
        <button className="icon-button ghost" type="button" aria-label={label}>
          <span aria-hidden="true">⋯</span>
        </button>
      </RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content className="menu-content" align="end" sideOffset={4}>
          {actions.map((action) => (
            <RadixDropdownMenu.Item
              className={action.tone === 'danger' ? 'menu-item danger' : 'menu-item'}
              key={action.label}
              disabled={action.disabled ?? false}
              onSelect={() => action.onSelect?.()}
              asChild={Boolean(action.href)}
            >
              {action.href ? <a href={action.href}>{action.label}</a> : <span>{action.label}</span>}
            </RadixDropdownMenu.Item>
          ))}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}
