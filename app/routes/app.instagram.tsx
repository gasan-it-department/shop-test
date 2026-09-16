import { Form, useLoaderData, useNavigation, useSearchParams } from "react-router"
import { redirect } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, EmptyState, PageHeader, formatDate } from "../components/ui"
import prisma from "../db.server"
import { requireShop } from "../lib/forum.server"
import { syncAccount } from "../lib/instagram-import.server"
import { buildAuthorizeUrl, readOAuthConfig, signState } from "../lib/instagram-oauth.server"
import { isUnrecoverable, needsRefresh } from "../lib/instagram.server"
import { appUrl, authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)
  const shop = await requireShop(session.shop)

  const config = readOAuthConfig(appUrl)
  const authorizeUrl = config
    ? buildAuthorizeUrl(config, signState(session.shop, process.env.SHOPIFY_API_SECRET || ""))
    : null

  const account = await prisma.instagramAccount.findFirst({
    where: { shopId: shop.id },
    include: { jobs: { orderBy: { updatedAt: "desc" }, take: 20 } },
  })

  return {
    timezone: shop.timezone,
    authorizeUrl,
    account: account
      ? {
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
            updatedAt: job.updatedAt.toISOString(),
            payload: job.payload,
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
  const intent = formData.get("intent")

  if (intent === "disconnect") {
    // deleting the account cascades its jobs. imported posts are left alone —
    // they belong to the forum now, and removing them would delete threads
    // shoppers have commented on.
    await prisma.instagramAccount.deleteMany({ where: { shopId: shop.id } })
    return redirect("/app/instagram")
  }

  if (intent === "sync") {
    const account = await prisma.instagramAccount.findFirst({ where: { shopId: shop.id } })
    if (!account) return redirect("/app/instagram")

    try {
      const result = await syncAccount(account.id)
      const params = new URLSearchParams({
        ig_synced: String(result.imported),
        ig_updated: String(result.updated),
      })
      return redirect(`/app/instagram?${params.toString()}`)
    } catch (error) {
      // the job row already recorded the failure; surface it rather than 500
      const message = error instanceof Error ? error.message : String(error)
      return redirect(`/app/instagram?ig_error=${encodeURIComponent(message.slice(0, 200))}`)
    }
  }

  return redirect("/app/instagram")
}

const TOKEN_TONE = {
  ok: "success",
  "refresh due": "warning",
  expired: "critical",
} as const

export default function Instagram() {
  const { account, authorizeUrl, timezone } = useLoaderData<typeof loader>()
  const [params] = useSearchParams()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  const error = params.get("ig_error")
  const connected = params.get("ig_connected")
  const synced = params.get("ig_synced")

  // instagram's consent screen refuses to render in an iframe, so this has to
  // navigate the top window. app bridge patches window.open to make "_top"
  // escape the admin frame.
  const connect = () => {
    if (authorizeUrl) window.open(authorizeUrl, "_top")
  }

  const banners = (
    <>
      {error ? (
        <Banner tone="critical" title="Instagram error">
          {error}
        </Banner>
      ) : null}
      {connected ? (
        <Banner tone="success" title="Connected">
          @{connected} is now linked. Run a sync to import posts.
        </Banner>
      ) : null}
      {synced ? (
        <Banner tone="success" title="Sync complete">
          {synced} imported, {params.get("ig_updated") ?? 0} updated. Imported posts land in a
          private &ldquo;Instagram&rdquo; category — make it public when you are ready.
        </Banner>
      ) : null}
    </>
  )

  if (!account) {
    return (
      <div className="page">
        <PageHeader title="Instagram" subtitle="Import posts and Reels into the forum." />
        {banners}

        {!authorizeUrl ? (
          <Banner tone="warning" title="Meta credentials not set">
            <code>META_APP_ID</code> and <code>META_APP_SECRET</code> are missing, so the consent
            flow cannot start. Add them to the environment and reload.
          </Banner>
        ) : null}

        <Card>
          <EmptyState
            title="No account connected"
            action={
              <button
                type="button"
                className="btn btn--primary"
                onClick={connect}
                disabled={!authorizeUrl}
              >
                Connect Instagram
              </button>
            }
          >
            Connecting sends you to Instagram to approve access. Meta issues a token valid for 60
            days, which this app refreshes before it lapses — a token allowed to expire cannot be
            refreshed, only re-granted.
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
          <div className="inline">
            <Form method="post">
              <input type="hidden" name="intent" value="sync" />
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
            </Form>
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
          </div>
        }
      />

      {banners}

      {account.disabledReason ? (
        <Banner tone="critical" title="Import disabled">
          {account.disabledReason}{" "}
          <button type="button" className="btn-link" onClick={connect}>
            Reconnect
          </button>
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

      <Card title={`Import history (${account.jobs.length})`} flush>
        {account.jobs.length === 0 ? (
          <EmptyState title="No syncs yet">Run one with the button above.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Status</th>
                  <th>Result</th>
                  <th>Attempts</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {account.jobs.map((job) => (
                  <tr key={job.id}>
                    <td>{job.kind}</td>
                    <td>
                      <Badge
                        tone={
                          job.status === "failed"
                            ? "critical"
                            : job.status === "done"
                              ? "success"
                              : "neutral"
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="cell-muted">{job.lastError ?? job.payload}</td>
                    <td className="cell-muted">{job.attempts}</td>
                    <td className="cell-muted">{formatDate(job.updatedAt, timezone)}</td>
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
