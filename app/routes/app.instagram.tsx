import { Form, useLoaderData, useNavigation } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import prisma from "../db.server"
import { requireShop } from "../lib/forum.server"
import { isUnrecoverable, needsRefresh } from "../lib/instagram.server"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const account = await prisma.instagramAccount.findFirst({
    where: { shopId: shop.id },
    include: { jobs: { orderBy: { updatedAt: "desc" }, take: 20 } },
  })

  return {
    timezone: shop.timezone,
    // connecting needs a Meta app; without these the flow cannot start
    metaConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    account: account
      ? {
          id: account.id,
          username: account.username,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          tokenExpiresAt: account.tokenExpiresAt.toISOString(),
          tokenState: isUnrecoverable(account.tokenExpiresAt)
            ? ("expired" as const)
            : needsRefresh(account.tokenExpiresAt)
              ? ("refresh due" as const)
              : ("ok" as const),
          disabledReason: account.disabledReason,
          jobs: account.jobs.map((job) => ({
            id: job.id,
            kind: job.kind,
            status: job.status,
            attempts: job.attempts,
            runAfter: job.runAfter.toISOString(),
            lastError: job.lastError,
          })),
        }
      : null,
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const formData = await request.formData()

  if (formData.get("intent") === "disconnect") {
    // deleting the account cascades its jobs. imported posts are left alone —
    // they belong to the forum now, and removing them would delete threads
    // shoppers have commented on.
    await prisma.instagramAccount.deleteMany({ where: { shopId: shop.id } })
  }

  return redirect("/app/instagram")
}

const TOKEN_TONE = {
  ok: "success",
  "refresh due": "warning",
  expired: "critical",
} as const

export default function Instagram() {
  const { account, metaConfigured, timezone } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  if (!account) {
    return (
      <div className="page">
        <PageHeader title="Instagram" subtitle="Import posts and Reels into the forum." />

        {!metaConfigured ? (
          <Banner tone="warning" title="Meta credentials not set">
            <code>META_APP_ID</code> and <code>META_APP_SECRET</code> are missing, so the consent
            flow cannot start. Add them to the environment and reload.
          </Banner>
        ) : null}

        <Card>
          <EmptyState title="No account connected">
            Connecting requires the merchant to consent through Meta, which issues a long-lived
            token this app refreshes on a schedule. A token allowed to lapse cannot be refreshed,
            only re-granted.
          </EmptyState>
        </Card>
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        title={`@${account.username}`}
        subtitle="Instagram import"
        action={
          <Form
            method="post"
            onSubmit={(event) => {
              if (!confirm("Disconnect this Instagram account? Imported posts are kept.")) {
                event.preventDefault()
              }
            }}
          >
            <input type="hidden" name="intent" value="disconnect" />
            <button type="submit" className="btn btn--danger" disabled={busy}>
              Disconnect
            </button>
          </Form>
        }
      />

      {account.disabledReason ? (
        <Banner tone="critical" title="Import disabled">
          {account.disabledReason}
        </Banner>
      ) : null}

      <Card title="Connection">
        <div className="inline">
          <span className="cell-muted">Access token</span>
          <Badge tone={TOKEN_TONE[account.tokenState]}>{account.tokenState}</Badge>
          <span className="cell-muted">
            expires {formatDate(account.tokenExpiresAt, timezone)}
          </span>
        </div>
        <p className="field__hint" style={{ marginTop: 10 }}>
          Last sync: {account.lastSyncedAt ? formatDate(account.lastSyncedAt, timezone) : "never"}
        </p>
      </Card>

      <Card title={`Import queue (${account.jobs.length})`} flush>
        {account.jobs.length === 0 ? (
          <EmptyState title="No jobs queued" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Run after</th>
                  <th>Last error</th>
                </tr>
              </thead>
              <tbody>
                {account.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.kind}</td>
                    <td>
                      <Badge tone={job.status === "failed" ? "critical" : "neutral"}>
                        {job.status}
                      </Badge>
                    </td>
                    <td className="cell-muted">{job.attempts}</td>
                    <td className="cell-muted">{formatDate(job.runAfter, timezone)}</td>
                    <td className="cell-muted">{job.lastError ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
