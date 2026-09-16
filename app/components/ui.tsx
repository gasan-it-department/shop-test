// small presentational pieces shared by the admin pages. plain elements over
// the css in app/styles/admin.css — nothing here imports a .server module, so
// it is safe for any route to use in a component.

import type { ReactNode } from "react"

export type Tone = "info" | "success" | "warning" | "critical" | "neutral"

export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={tone === "info" ? "badge" : `badge badge--${tone}`}>{children}</span>
}

export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
}) {
  return (
    <div className={tone === "info" ? "banner" : `banner banner--${tone}`}>
      {title ? <p className="banner__title">{title}</p> : null}
      {children}
    </div>
  )
}

export function Card({
  title,
  action,
  flush,
  children,
}: {
  title?: string
  action?: ReactNode
  flush?: boolean
  children: ReactNode
}) {
  return (
    <section className="card">
      {title || action ? (
        <header className="card__head">
          <h2 className="card__title">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={flush ? "card__body card__body--flush" : "card__body"}>{children}</div>
    </section>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="page__head">
      <div>
        <h1 className="page__title">{title}</h1>
        {subtitle ? <p className="page__subtitle">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** dates render on the server and the client, so pin the formatting */
export function formatDate(iso: string, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso))
}
