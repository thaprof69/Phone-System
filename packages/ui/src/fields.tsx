import type { ComponentProps, ReactNode } from 'react';

/**
 * Form controls are plain HTML so that every governed workflow keeps working with
 * server actions and without client JavaScript. Rich interactive controls exist
 * separately in `interactive.tsx` for cases that genuinely need them.
 */

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function FieldFrame({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={error ? 'field field-invalid' : 'field'}>
      <label htmlFor={id}>
        {label}
        {required ? (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
} & Omit<ComponentProps<'input'>, 'id'>) {
  const description = describedBy(id, hint, error);
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(rest.required ? { required: true } : {})}
    >
      <input
        id={id}
        name={rest.name ?? id}
        type={rest.type ?? 'text'}
        {...(description ? { 'aria-describedby': description } : {})}
        {...(error ? { 'aria-invalid': true } : {})}
        {...rest}
      />
    </FieldFrame>
  );
}

export function TextArea({
  id,
  label,
  hint,
  error,
  rows = 6,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
} & Omit<ComponentProps<'textarea'>, 'id'>) {
  const description = describedBy(id, hint, error);
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(rest.required ? { required: true } : {})}
    >
      <textarea
        id={id}
        name={rest.name ?? id}
        rows={rows}
        {...(description ? { 'aria-describedby': description } : {})}
        {...(error ? { 'aria-invalid': true } : {})}
        {...rest}
      />
    </FieldFrame>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function SelectField({
  id,
  label,
  options,
  hint,
  error,
  placeholder,
  ...rest
}: {
  id: string;
  label: string;
  options: readonly SelectOption[];
  hint?: string;
  error?: string;
  placeholder?: string;
} & Omit<ComponentProps<'select'>, 'id' | 'children'>) {
  const description = describedBy(id, hint, error);
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(rest.required ? { required: true } : {})}
    >
      <select
        id={id}
        name={rest.name ?? id}
        {...(description ? { 'aria-describedby': description } : {})}
        {...(error ? { 'aria-invalid': true } : {})}
        {...rest}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled ?? false}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export function CheckboxField({
  id,
  label,
  hint,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
} & Omit<ComponentProps<'input'>, 'id' | 'type'>) {
  return (
    <div className="field field-checkbox">
      <input
        id={id}
        name={rest.name ?? id}
        type="checkbox"
        {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
        {...rest}
      />
      <label htmlFor={id}>{label}</label>
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function RadioGroupField({
  name,
  legend,
  options,
  value,
  hint,
}: {
  name: string;
  legend: string;
  options: readonly SelectOption[];
  value?: string;
  hint?: string;
}) {
  return (
    <fieldset className="field field-radio-group">
      <legend>{legend}</legend>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {options.map((option) => {
        const id = `${name}-${option.value}`;
        return (
          <div className="radio-option" key={option.value}>
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              defaultChecked={value === option.value}
              disabled={option.disabled ?? false}
            />
            <label htmlFor={id}>{option.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}

export function Fieldset({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="form-fieldset">
      <legend>{legend}</legend>
      {description ? <p className="field-hint">{description}</p> : null}
      <div className="form-grid">{children}</div>
    </fieldset>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

/**
 * WCAG 2.2 error-summary pattern: a single alert at the top of the form linking to
 * each invalid control, so keyboard and screen-reader users are not left hunting.
 */
export function ErrorSummary({
  errors,
  title = 'There is a problem',
}: {
  errors: ReadonlyArray<{ fieldId: string; message: string }>;
  title?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div className="error-summary" role="alert" tabIndex={-1}>
      <h2>{title}</h2>
      <ul>
        {errors.map((error) => (
          <li key={error.fieldId}>
            <a href={`#${error.fieldId}`}>{error.message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ filters */

/**
 * Filters submit as a GET form so the resulting view is a shareable URL and the
 * page stays a server component. `hiddenFields` preserves unrelated query state
 * such as the current sort.
 */
export function FilterBar({
  action,
  children,
  hiddenFields = {},
  resetHref,
  label = 'Filter records',
}: {
  action: string;
  children: ReactNode;
  hiddenFields?: Record<string, string>;
  resetHref?: string;
  label?: string;
}) {
  return (
    <form className="filter-bar" method="get" action={action} role="search" aria-label={label}>
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input type="hidden" name={name} value={value} key={name} />
      ))}
      <div className="filter-controls">{children}</div>
      <div className="filter-actions">
        <button className="button primary small" type="submit">
          Apply
        </button>
        {resetHref ? (
          <a className="button ghost small" href={resetHref}>
            Clear
          </a>
        ) : null}
      </div>
    </form>
  );
}

export function SearchInput({
  id = 'search',
  name = 'q',
  label = 'Search',
  placeholder,
  defaultValue,
}: {
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div className="field field-search">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="search"
        {...(placeholder ? { placeholder } : {})}
        {...(defaultValue ? { defaultValue } : {})}
      />
    </div>
  );
}

export function DateRangeFields({
  fromName = 'from',
  toName = 'to',
  fromValue,
  toValue,
  legend = 'Date range',
}: {
  fromName?: string;
  toName?: string;
  fromValue?: string;
  toValue?: string;
  legend?: string;
}) {
  return (
    <fieldset className="field field-date-range">
      <legend>{legend}</legend>
      <div>
        <label htmlFor={fromName}>From</label>
        <input
          type="date"
          id={fromName}
          name={fromName}
          {...(fromValue ? { defaultValue: fromValue } : {})}
        />
      </div>
      <div>
        <label htmlFor={toName}>To</label>
        <input
          type="date"
          id={toName}
          name={toName}
          {...(toValue ? { defaultValue: toValue } : {})}
        />
      </div>
    </fieldset>
  );
}
