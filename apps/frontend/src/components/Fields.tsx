import { useId, type ReactNode } from 'react';

interface BaseProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

export interface TextFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  rows?: number;
  type?: 'text' | 'search' | 'password' | 'number' | 'date';
  max?: number;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: 'numeric' | 'text';
  /** Elemento junto al campo (p. ej. un botón). */
  after?: ReactNode;
  name?: string;
}

/** Campo de texto con etiqueta, ayuda, error en línea y contador opcional. */
export function TextField({ label, value, onChange, error, hint, required, multiline, rows = 4, type = 'text', max, placeholder, autoComplete, inputMode, after, name }: TextFieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    name,
    value,
    placeholder,
    required,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: `input${error ? ' is-invalid' : ''}`,
  } as const;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={after ? 'field-row' : undefined}>
        {multiline ? (
          <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...common} type={type} autoComplete={autoComplete} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
        )}
        {after}
      </div>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {max ? (
        <p className={`counter${value.length > max ? ' over' : ''}`} aria-hidden="true">
          {value.length}/{max}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface SelectFieldProps extends BaseProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}

export function SelectField({ label, value, onChange, options, error, hint, required }: SelectFieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className={`input${error ? ' is-invalid' : ''}`} value={value} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CheckField({ label, checked, onChange, error, children }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; error?: string; children?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {children}
      {error ? (
        <p className="error-text" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
