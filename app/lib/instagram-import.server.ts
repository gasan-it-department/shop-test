// --- instagram import -------------------------------------------------------
//
// one sync = walk the media edge from the stored cursor, upsert each item as a
// post, advance the cursor. every step is recorded on an ImportJob row so a
// failure leaves evidence rather than a silent empty feed.
//
// this runs inline when the merchant clicks Sync, which is honest for one
// account and wrong for a hundred. the ImportJob table is shaped for a real
// worker (status, attempts, runAfter) so moving it to a background process is
// a change of caller, not of schema — see docs/sqlite-to-postgres.md for the
// FOR UPDATE SKIP LOCKED claim that belongs with it.

import type { InstagramAccount } from "@prisma/client"

import prisma from "../db.server"
import {
  exchangeForLongLivedToken,
  readOAuthConfig,
} from "./instagram-oauth.server"
import { fetchMediaPage, isUnrecoverable, mediaToPost, needsRefresh } from "./instagram.server"
import { refreshLongLivedToken } from "./instagram.server"

export interface SyncResult {
  imported: number
  updated: number
  pages: number
  cursor: string | null
  tokenRefreshed: boolean
}

/** how many pages one click will walk, so a long history can't hang a request */
const MAX_PAGES_PER_RUN = 4

/**
 * Refresh the stored token if it is inside the margin.
 *
 * A token past expiry cannot be refreshed at all — the merchant has to
 * re-consent — so that case is recorded and surfaced rather than retried.
 */
export async function ensureFreshToken(
  account: InstagramAccount,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshed: boolean }> {
  if (isUnrecoverable(account.tokenExpiresAt)) {
    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { disabledReason: "Access token expired. Reconnect the account to resume importing." },
    })
    throw new Error("Instagram token expired")
  }

  if (!needsRefresh(account.tokenExpiresAt)) {
    return { accessToken: account.accessToken, refreshed: false }
  }

  const refreshed = await refreshLongLivedToken(account.accessToken, { fetchImpl })
  await prisma.instagramAccount.update({
    where: { id: account.id },
    data: {
      accessToken: refreshed.accessToken,
      tokenExpiresAt: refreshed.expiresAt,
      disabledReason: null,
    },
  })

  return { accessToken: refreshed.accessToken, refreshed: true }
}

/**
 * The category imported posts land in, created once per shop.
 *
 * Private by default: a merchant connecting Instagram should not have a year
 * of back-catalogue appear on their storefront the moment they click connect.
 * They can make it public from the Categories screen when they're ready.
 */
async function importCategory(shopId: string) {
  const existing = await prisma.category.findUnique({
    where: { shopId_handle: { shopId, handle: "instagram" } },
  })
  if (existing) return existing

  return prisma.category.create({
    data: { shopId, handle: "instagram", title: "Instagram", isPrivate: true, position: 99 },
  })
}

export async function syncAccount(
  accountId: string,
  options: { fetchImpl?: typeof fetch; maxPages?: number } = {},
): Promise<SyncResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const maxPages = options.maxPages ?? MAX_PAGES_PER_RUN

  const account = await prisma.instagramAccount.findUniqueOrThrow({
    where: { id: accountId },
  })

  const job = await prisma.importJob.create({
    data: { accountId: account.id, kind: "media", status: "running", claimedAt: new Date() },
  })

  try {
    const { accessToken, refreshed } = await ensureFreshToken(account, fetchImpl)
    const category = await importCategory(account.shopId)

    let cursor = account.lastCursor
    let imported = 0
    let updated = 0
    let pages = 0

    for (; pages < maxPages; pages++) {
      const page = await fetchMediaPage(accessToken, cursor, { fetchImpl })

      for (const media of page.media) {
        const fields = mediaToPost(media, account.shopId, category.id)

        // upsert on the natural key, so re-running a sync over overlapping
        // pages updates instead of duplicating
        const result = await prisma.post.upsert({
          where: {
            shopId_source_externalId: {
              shopId: account.shopId,
              source: "instagram",
              externalId: media.id,
            },
          },
          update: { title: fields.title, body: fields.body, publishedAt: fields.publishedAt },
          create: fields,
        })

        if (result.createdAt.getTime() === result.updatedAt.getTime()) imported++
        else updated++
      }

      cursor = page.nextCursor
      if (!cursor) break
    }

    await prisma.instagramAccount.update({
      where: { id: account.id },
      data: { lastCursor: cursor, lastSyncedAt: new Date(), disabledReason: null },
    })

    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "done",
        lastError: null,
        payload: JSON.stringify({ imported, updated, pages }),
      },
    })

    return { imported, updated, pages, cursor, tokenRefreshed: refreshed }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await prisma.importJob.update({
      where: { id: job.id },
      data: { status: "failed", attempts: { increment: 1 }, lastError: message.slice(0, 500) },
    })
    throw error
  }
}

/** true when the environment can start an oauth flow at all */
export function instagramConfigured(appUrl: string): boolean {
  return readOAuthConfig(appUrl) !== null
}

export { exchangeForLongLivedToken }
