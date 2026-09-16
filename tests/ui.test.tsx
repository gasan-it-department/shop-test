import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  Badge,
  Banner,
  Card,
  EmptyState,
  Field,
  PageHeader,
  formatDate,
} from "../app/components/ui"

const html = (node: React.ReactElement) => renderToStaticMarkup(node)

describe("Badge", () => {
  it("defaults to the info tone with no modifier class", () => {
    expect(html(<Badge>ok</Badge>)).toBe('<span class="badge">ok</span>')
  })

  it.each(["success", "warning", "critical", "neutral"] as const)(
    "applies the %s modifier",
    (tone) => {
      expect(html(<Badge tone={tone}>x</Badge>)).toContain(`badge badge--${tone}`)
    },
  )
})

describe("Banner", () => {
  it("renders a title and body", () => {
    const markup = html(
      <Banner tone="critical" title="Broken">
        <p>Details</p>
      </Banner>,
    )
    expect(markup).toContain("banner banner--critical")
    expect(markup).toContain("Broken")
    expect(markup).toContain("Details")
  })

  it("omits the title element when there is no title", () => {
    expect(html(<Banner>body</Banner>)).not.toContain("banner__title")
  })
})

describe("Card", () => {
  it("omits the header when there is no title or action", () => {
    expect(html(<Card>body</Card>)).not.toContain("card__head")
  })

  it("renders a header when given a title", () => {
    expect(html(<Card title="Posts">body</Card>)).toContain("card__title")
  })

  it("drops body padding when flush", () => {
    expect(html(<Card flush>rows</Card>)).toContain("card__body card__body--flush")
  })
})

describe("Field", () => {
  it("links the label to the input by name", () => {
    const markup = html(
      <Field label="Title" name="title">
        <input id="title" name="title" />
      </Field>,
    )
    expect(markup).toContain('for="title"')
  })

  it("shows the error and hides the hint when both are given", () => {
    const markup = html(
      <Field label="Title" name="title" hint="Some hint" error="Too short">
        <input id="title" />
      </Field>,
    )
    expect(markup).toContain("Too short")
    expect(markup).not.toContain("Some hint")
    expect(markup).toContain('role="alert"')
  })

  it("shows the hint when there is no error", () => {
    const markup = html(
      <Field label="Title" name="title" hint="Some hint">
        <input id="title" />
      </Field>,
    )
    expect(markup).toContain("Some hint")
  })
})

describe("EmptyState / PageHeader", () => {
  it("renders an empty state with an action", () => {
    const markup = html(
      <EmptyState title="No posts" action={<button>New</button>}>
        Nothing here yet
      </EmptyState>,
    )
    expect(markup).toContain("No posts")
    expect(markup).toContain("Nothing here yet")
    expect(markup).toContain("<button>New</button>")
  })

  it("omits the subtitle when not given", () => {
    expect(html(<PageHeader title="Posts" />)).not.toContain("page__subtitle")
  })
})

describe("formatDate", () => {
  const iso = "2026-02-01T10:00:00.000Z"

  it("formats in UTC by default", () => {
    expect(formatDate(iso)).toBe("01 Feb 2026, 10:00")
  })

  it("respects the shop timezone", () => {
    // the whole point of reading ianaTimezone from shopify rather than
    // hard-coding one
    expect(formatDate(iso, "Asia/Manila")).toBe("01 Feb 2026, 18:00")
  })

  it("shifts the date across a day boundary correctly", () => {
    expect(formatDate("2026-02-01T23:30:00.000Z", "Asia/Manila")).toBe("02 Feb 2026, 07:30")
  })

  it("is stable between two calls, so server and client markup agree", () => {
    expect(formatDate(iso, "Europe/Paris")).toBe(formatDate(iso, "Europe/Paris"))
  })
})
