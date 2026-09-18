import { Form, Link, useLoaderData, useNavigation, useSearchParams } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { anonymiseMemberById, listMembers, requireShop } from "../lib/forum.server"
import { authenticate } from "../shopify.server"

const PAGE_SIZE = 25

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const url = new URL(request.url)
  const search = url.searchParams.get("q")?.trim() || undefined
  const status = url.searchParams.get("status") ?? ""
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)

  const { items, total } = await listMembers(shop.id, {
    search,
    anonymised: status === "redacted" ? true : status === "active" ? false : undefined,
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  })

  return {
    timezone: shop.timezone,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    total,
    members: items.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      // first 12 chars only — enough to tell rows apart, not enough to be
      // useful to anyone who shouldn't have it
      hashPreview: member.shopperHash.slice(0, 12),
      anonymised: member.anonymisedAt !== null,
      anonymisedAt: member.anonymisedAt?.toISOString() ?? null,
      createdAt: member.createdAt.toISOString(),
      posts: member._count.posts,
      comments: member._count.comments,
      likes: member._count.reactions,
    })),
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const formData = await request.formData()
  if (formData.get("intent") === "anonymise") {
    await anonymiseMemberById(shop.id, String(formData.get("id") ?? ""))
  }

  // keep the filters and page the merchant was looking at
  return redirect(String(formData.get("redirectTo") || "/app/members"))
}

export default function Members() {
  const { members, timezone, page, pageCount, total } = useLoaderData<typeof loader>()
  const [searchParams] = useSearchParams()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  const currentQuery = searchParams.get("q") ?? ""
  const currentStatus = searchParams.get("status") ?? ""
  const filtered = Boolean(currentQuery || currentStatus)
  const redirectTo = `/app/members?${searchParams.toString()}`

  return (
    <div className="page">
      <PageHeader
        title="Members"
        subtitle={`${total} member${total === 1 ? "" : "s"}`}
      />

      <Banner tone="info" title="What is stored">
        No IP address, no password, and no Shopify customer id in the clear. Each member is keyed
        by an HMAC of the customer id scoped to this shop, so the same shopper is not
        correlatable across merchants.
      </Banner>

      <Card>
        <Form method="get" className="inline">
          <input
            type="text"
            name="q"
            placeholder="Search display names"
            defaultValue={currentQuery}
            style={{ maxWidth: 280 }}
          />
          <select name="status" defaultValue={currentStatus} style={{ maxWidth: 200 }}>
            <option value="">All members</option>
            <option value="active">Active</option>
            <option value="redacted">Redacted</option>
          </select>
          <button type="submit" className="btn" disabled={busy}>
            Filter
          </button>
          {filtered ? (
            <Link to="/app/members" className="btn-link">
              Clear
            </Link>
          ) : null}
        </Form>
      </Card>

      <Card title="All members" flush>
        {members.length === 0 ? (
          <EmptyState title={filtered ? "No members match" : "No members yet"}>
            {filtered
              ? "Try a different search or status."
              : "A member row is created the first time a signed-in shopper posts, comments or likes from the storefront."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Display name</th>
                  <th>Key</th>
                  <th>Posts</th>
                  <th>Comments</th>
                  <th>Likes</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <Link to={`/app/members/${member.id}`} className="cell-title">
                        {member.displayName}
                      </Link>{" "}
                      {member.anonymised ? <Badge tone="neutral">Redacted</Badge> : null}
                    </td>
                    <td>
                      <code>{member.hashPreview}…</code>
                    </td>
                    <td className="cell-muted">{member.posts}</td>
                    <td className="cell-muted">{member.comments}</td>
                    <td className="cell-muted">{member.likes}</td>
                    <td className="cell-muted">{formatDate(member.createdAt, timezone)}</td>
                    <td className="actions">
                      {member.anonymised ? (
                        <span className="cell-muted">
                          {member.anonymisedAt
                            ? formatDate(member.anonymisedAt, timezone)
                            : "Anonymised"}
                        </span>
                      ) : (
                        <Form
                          method="post"
                          style={{ display: "inline" }}
                          onSubmit={(event) => {
                            if (
                              !confirm(
                                `Anonymise ${member.displayName}? Their posts and comments stay, but the author becomes unidentifiable and cannot be re-attached.`,
                              )
                            ) {
                              event.preventDefault()
                            }
                          }}
                        >
                          <input type="hidden" name="intent" value="anonymise" />
                          <input type="hidden" name="id" value={member.id} />
                          <input type="hidden" name="redirectTo" value={redirectTo} />
                          <button type="submit" className="btn btn--sm btn--danger" disabled={busy}>
                            Anonymise
                          </button>
                        </Form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pageCount > 1 ? (
        <div className="inline" style={{ marginTop: 16, justifyContent: "center" }}>
          <PageLink page={page - 1} disabled={page <= 1} params={searchParams}>
            Previous
          </PageLink>
          <span className="cell-muted">
            Page {page} of {pageCount}
          </span>
          <PageLink page={page + 1} disabled={page >= pageCount} params={searchParams}>
            Next
          </PageLink>
        </div>
      ) : null}

      <Card title="GDPR">
        <p className="cell-muted" style={{ marginTop: 0 }}>
          Anonymising here runs the same code as the <code>customers/redact</code> webhook, so a
          request made through Shopify and a request made by the merchant produce the same result.
          Posts, comments and likes all survive deliberately — deleting posts and comments would
          gut threads other shoppers are reading, and removing likes would silently change counts
          on posts nobody edited. What is severed is the link to the person: the stored key is
          replaced, so a later sign-in by the same shopper cannot re-attach to this row.
        </p>
      </Card>
    </div>
  )
}

function PageLink({
  page,
  disabled,
  params,
  children,
}: {
  page: number
  disabled: boolean
  params: URLSearchParams
  children: string
}) {
  if (disabled) {
    return (
      <span className="btn btn--sm" aria-disabled="true" style={{ opacity: 0.5 }}>
        {children}
      </span>
    )
  }
  const next = new URLSearchParams(params)
  next.set("page", String(page))
  return (
    <Link to={`/app/members?${next.toString()}`} className="btn btn--sm">
      {children}
    </Link>
  )
}
