"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, RotateCw, X } from "lucide-react";
import { cx } from "@/lib/cx";

export { cx };

// ---------- Buttons ----------

type Variant = "primary" | "secondary" | "danger" | "ghost" | "warning" | "dark";
const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm ring-1 ring-inset ring-brand-700/30 hover:from-brand-600 hover:to-brand-700 disabled:from-brand-300 disabled:to-brand-300 disabled:ring-0",
  dark: "bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:bg-slate-300",
  secondary: "bg-white text-slate-700 shadow-xs ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400",
  danger: "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-sm ring-1 ring-inset ring-red-700/30 hover:from-red-600 hover:to-red-700 disabled:opacity-50",
  warning: "bg-gradient-to-b from-saffron-400 to-saffron-500 text-white shadow-sm ring-1 ring-inset ring-saffron-600/30 hover:to-saffron-600 disabled:opacity-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" && "h-8 rounded-lg px-3 text-xs",
        size === "md" && "h-10 rounded-xl px-4 text-sm",
        size === "lg" && "h-12 rounded-xl px-6 text-[15px]",
        variants[variant],
        className
      )}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Form controls ----------

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const control =
  "w-full rounded-xl border-0 bg-white px-3.5 text-sm text-slate-900 shadow-xs ring-1 ring-inset ring-slate-200 outline-none transition placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(control, "h-11", props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(control, "h-11 cursor-pointer pr-9", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(control, "py-2.5 leading-relaxed", props.className)} />;
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative mt-0.5 h-6 w-11 shrink-0 rounded-full shadow-inner transition-colors duration-200", checked ? "bg-brand-500" : "bg-slate-300")}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200", checked ? "left-[22px]" : "left-0.5")} />
      </button>
    </label>
  );
}

// ---------- Layout ----------

export function Card({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {action}
        </header>
      )}
      <div className={cx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">{eyebrow}</p>}
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <div className="mt-1.5 text-sm text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const statTones = {
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  green: "bg-brand-50 text-brand-700 ring-brand-200/70",
  amber: "bg-saffron-50 text-saffron-600 ring-saffron-200/70",
  red: "bg-red-50 text-red-600 ring-red-200/70",
  blue: "bg-sky-50 text-sky-700 ring-sky-200/70",
};

export function StatCard({ label, value, hint, tone = "slate", icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: keyof typeof statTones; icon?: ReactNode }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        {icon && <span className={cx("flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset [&>svg]:h-[18px] [&>svg]:w-[18px]", statTones[tone])}>{icon}</span>}
      </div>
      <p className="tabular-nums mt-2 text-[28px] font-bold leading-none tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-inset ring-slate-200 [&>svg]:h-6 [&>svg]:w-6">
        {icon ?? <Inbox />}
      </span>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="space-y-4 py-2 animate-fade-in" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-56 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-inset ring-red-200">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 shadow-xs ring-1 ring-red-200 hover:bg-red-50">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}

// ---------- Badges ----------

const badgeTones: Record<string, [string, string]> = {
  // [pill, dot]
  green: ["bg-brand-50 text-brand-800 ring-brand-600/20", "bg-brand-500"],
  sky: ["bg-sky-50 text-sky-800 ring-sky-600/20", "bg-sky-500"],
  indigo: ["bg-indigo-50 text-indigo-800 ring-indigo-600/20", "bg-indigo-500"],
  violet: ["bg-violet-50 text-violet-800 ring-violet-600/20", "bg-violet-500"],
  fuchsia: ["bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-600/20", "bg-fuchsia-500"],
  amber: ["bg-saffron-50 text-saffron-700 ring-saffron-600/25", "bg-saffron-500"],
  orange: ["bg-orange-50 text-orange-800 ring-orange-600/20", "bg-orange-500"],
  red: ["bg-red-50 text-red-700 ring-red-600/20", "bg-red-500"],
  gray: ["bg-slate-100 text-slate-600 ring-slate-500/15", "bg-slate-400"],
};
const valueTone: Record<string, keyof typeof badgeTones> = {
  active: "green", approved: "green", delivered: "green", paid: "green", online: "green",
  info: "sky", placed: "sky",
  confirmed: "indigo", preparing: "violet", ready: "fuchsia",
  pending: "amber", warning: "amber", payment_pending: "amber",
  picked_up: "orange", busy: "orange",
  suspended: "red", rejected: "red", cancelled: "red", failed: "red", critical: "red",
  refunded: "gray", offline: "gray",
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const [pill, dot] = badgeTones[valueTone[value] ?? "gray"];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold capitalize ring-1 ring-inset", pill)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", dot)} />
      {label ?? value.replace(/_/g, " ")}
    </span>
  );
}

// ---------- Table / pagination ----------

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/70">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 first:rounded-l-lg last:rounded-r-lg">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors">{children}</tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return <p className="px-1 pt-4 text-xs text-slate-500">{total} result{total === 1 ? "" : "s"}</p>;
  return (
    <div className="flex items-center justify-between px-1 pt-4 text-xs text-slate-500">
      <span className="tabular-nums">{total} results · page {page} of {pages}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" /> Previous</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/40 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal
        className={cx("max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-xl ring-1 ring-slate-900/5 animate-pop sm:rounded-3xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="px-6 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

/** Confirmation dialog with an optional "reason" input (used for suspend / reject / cancel). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  variant = "danger",
  askReason,
  reasonRequired,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: Variant;
  askReason?: boolean;
  reasonRequired?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch {
      // onConfirm reports its own error (toast); keep the dialog open so the user can retry.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={variant} loading={busy} disabled={reasonRequired && reason.trim().length < 3} onClick={submit}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-slate-600">{message}</div>
      {askReason && (
        <div className="mt-5">
          <Field label={reasonRequired ? "Reason (required)" : "Reason (optional)"} hint="The affected person will see this.">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>
        </div>
      )}
    </Modal>
  );
}

// ---------- Toasts ----------

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastCtx = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-24 right-5 z-[1100] sm:bottom-5 flex w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col gap-2.5">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-2xl bg-slate-900/95 px-4 py-3.5 text-sm text-white shadow-xl ring-1 ring-white/10 backdrop-blur animate-pop">
            {t.tone === "success" ? <CheckCircle2 className="mt-px h-5 w-5 shrink-0 text-brand-400" /> : <AlertTriangle className="mt-px h-5 w-5 shrink-0 text-red-400" />}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
