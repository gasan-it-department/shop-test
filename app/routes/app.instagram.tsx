import { useLoaderData } from "react-router"
import type { LoaderFunctionArgs } from "react-router"

import prisma from "../db.server"
import { isUnrecoverable, needsRefresh } from "../lib/instagram.server"
import { authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request)

  const account = await prisma.instagramAccount.findFirst({
    where: { shop: { domain: session.shop } },
    include: { jobs: { orderBy: { updatedAt: "desc" }, take: 20 } },
  })

  if (!account) return { connected: false as const }

  return {
    connected: true as const,
    username: account.username,
    lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
    tokenState: isUnrecoverable(account.tokenExpiresAt)
      ? ("expired" as const)
      : needsRefresh(account.tokenExpiresAt)
        ? ("refresh due" as const)
        : ("ok" as const),
    jobs: account.jobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      attempts: job.attempts,
      runAfter: job.runAfter.toISOString(),
      lastError: job.lastError,
    })),
  }
}

const TOKEN_TONE = {
  ok: "success",
  "refresh due": "warning",
  expired: "critical",
} as const

export default function Instagram() {
  const data = useLoaderData<typeof loader>()

  if (!data.connected) {
    return (
      <s-page heading="Instagram">
        <s-section>
          <s-paragraph>
            No Instagram account is connected. Connecting requires the merchant
            to consent through Meta, which issues a long-lived token this app
            then refreshes on a schedule. A token allowed to lapse cannot be
            refreshed, only re-granted.
          </s-paragraph>
        </s-section>
      </s-page>
    )
  }

  return (
    <s-page heading="Instagram">
      <s-section heading={`@${data.username}`}>
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small">
            <s-text>Access token</s-text>
            <s-badge tone={TOKEN_TONE[data.tokenState]}>{data.tokenState}</s-badge>
          </s-stack>
          <s-text tone="neutral">Last sync: {data.lastSyncedAt ?? "never"}</s-text>
        </s-stack>
      </s-section>

      <s-section heading="Import queue">
        {data.jobs.length === 0 ? (
          <s-paragraph tone="neutral">No jobs queued.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Job</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Attempts</s-table-header>
              <s-table-header>Run after</s-table-header>
              <s-table-header>Last error</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {data.jobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{job.kind}</s-table-cell>
                  <s-table-cell>{job.status}</s-table-cell>
                  <s-table-cell>{job.attempts}</s-table-cell>
                  <s-table-cell>{job.runAfter}</s-table-cell>
                  <s-table-cell>{job.lastError ?? "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  )
}
