import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Form controls for the onboarding wizard, in the console's existing visual
 * language (`border-ink-200`, `rounded-xl`, crimson focus) — the same shapes the
 * settings page uses, lifted out so every step looks identical.
 *
 * Each field can be marked `problem`, which is how the API's own verdict reaches
 * the seller: a field name in `missing`, or one the reviewer listed in
 * `changesRequested`, is outlined and given the reason underneath. Nothing here
 * decides validity by itself.
 */

const CONTROL =
  "h-11 w-full rounded-xl border bg-white px-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

function controlClass(problem?: boolean, className?: string): string {
  return cn(
    CONTROL,
    problem ? "border-red-200 focus:border-[#c02636]" : "border-ink-200 focus:border-crimson-300",
    className,
  );
}

type BaseProps = {
  label: string;
  hint?: string;
  required?: boolean;
  problem?: string | null;
  className?: string;
};

function Shell({
  label,
  hint,
  required,
  problem,
  htmlFor,
  children,
}: BaseProps & { htmlFor: string; children: React.ReactNode }) {
  return (
    <div className={cn("block")}>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm font-medium text-ink-700">{label}</span>
        {required && (
          <span className="text-crimson-600" aria-label="required">
            *
          </span>
        )}
      </label>
      {children}
      {problem ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[#c02636]">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
      )}
    </div>
  );
}

export function TextField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  inputMode,
  maxLength,
  autoComplete,
  ...base
}: BaseProps & {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "email" | "decimal";
  maxLength?: number;
  autoComplete?: string;
}) {
  return (
    <Shell {...base} htmlFor={id}>
      <input
        id={id}
        value={value}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={base.problem ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClass(!!base.problem, base.className)}
      />
    </Shell>
  );
}

export function TextAreaField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  rows = 4,
  maxLength,
  ...base
}: BaseProps & {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <Shell {...base} htmlFor={id}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={base.problem ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClass(!!base.problem, cn("h-auto py-2.5", base.className))}
      />
    </Shell>
  );
}

export function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose…",
  disabled,
  ...base
}: BaseProps & {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Shell {...base} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={base.problem ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={controlClass(!!base.problem, base.className)}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

/** A labelled checkbox row, for the boolean fields and the terms box. */
export function CheckField({
  id,
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-300 text-crimson-600 accent-crimson-600 disabled:cursor-not-allowed"
      />
      <label htmlFor={id} className="text-sm text-ink-700">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-ink-400">{hint}</span>}
      </label>
    </div>
  );
}

export function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson-50 text-crimson-600">
        {icon}
      </span>
      <div>
        <h2 className="font-semibold text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-500">{hint}</p>}
      </div>
    </div>
  );
}

/** Read-only presentation of a saved value, used once editing is locked. */
export function ReadField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-sm text-ink-800">{value || <span className="text-ink-400">—</span>}</p>
    </div>
  );
}
