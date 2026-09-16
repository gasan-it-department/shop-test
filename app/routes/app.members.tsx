import { Form, useLoaderData, useNavigation } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import { anonymiseMemberById, listMembers, requireShop } from "../lib/forum.server"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)
  const members = await listMembers(shop.id)

  return {
    timezone: shop.timezone,
    members: members.map((member) => ({
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

  return redirect("/app/members")
}

export default function Members() {
  const { members, timezone } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader title="Members" subtitle="Shoppers who have posted or commented." />

      <Banner tone="info" title="What is stored">
        No IP address, no password, and no Shopify customer id in the clear. Each member is keyed
        by an HMAC of the customer id scoped to this shop, so the same shopper is not
        correlatable across merchants.
      </Banner>

      <Card title={`Members (${members.length})`} flush>
        {members.length === 0 ? (
          <EmptyState title="No members yet">
            A member row is created the first time a signed-in shopper posts from the storefront.
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
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      {member.displayName}{" "}
                      {member.anonymised ? <Badge tone="neutral">Redacted</Badge> : null}
                    </td>
                    <td>
                      <code>{member.hashPreview}…</code>
                    </td>
                    <td className="cell-muted">{member.posts}</td>
                    <td className="cell-muted">{member.comments}</td>
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

      <Card title="GDPR">
        <p className="cell-muted" style={{ marginTop: 0 }}>
          Anonymising here runs the same code as the <code>customers/redact</code> webhook, so a
          request made through Shopify and a request made by the merchant produce the same result.
          Posts and comments survive deliberately — deleting them would gut threads other shoppers
          are reading.
        </p>
      </Card>
    </div>
  )
}
