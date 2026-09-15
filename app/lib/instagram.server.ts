// --- meta graph api client --------------------------------------------------
// long-lived tokens last 60 days and can't be refreshed once expired.
// the media edge is cursor-paginated and the cursor has to be persisted.
// rate limits come back as 429 + Retry-After, ignore them and you get a
// 4-hour application block.

import { HttpError, parseRetryAfter, withRetry, type RetryOptions } from "./retry"

const GRAPH_BASE = "https://graph.instagram.com"
const GRAPH_VERSION = "v21.0"

/** refresh this far ahead of expiry so a slow queue never races it */
export const TOKEN_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000

export interface InstagramMedia {
  id: string
  caption?: string
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM"
  media_url?: string
  permalink: string
  timestamp: string
}

export interface MediaPage {
  media: InstagramMedia[]
  nextCursor: string | null
}

export interface GraphClientOptions extends RetryOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export function needsRefresh(
  tokenExpiresAt: Date,
  now: Date = new Date(),
  marginMs: number = TOKEN_REFRESH_MARGIN_MS,
): boolean {
  return tokenExpiresAt.getTime() - now.getTime() <= marginMs
}

// past expiry there's no refresh, only re-consent
export function isUnrecoverable(tokenExpiresAt: Date, now: Date = new Date()): boolean {
  return tokenExpiresAt.getTime() <= now.getTime()
}

async function graphRequest<T>(
  path: string,
  params: Record<string, string>,
  options: GraphClientOptions,
): Promise<T> {
  const { fetchImpl = fetch, baseUrl = GRAPH_BASE, ...retryOptions } = options
  const url = new URL(`${baseUrl}/${GRAPH_VERSION}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return withRetry(async () => {
    const response = await fetchImpl(url.toString(), {
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      throw new HttpError(
        response.status,
        `Graph API ${response.status} for ${path}`,
        parseRetryAfter(response.headers.get("retry-after")),
      )
    }

    return (await response.json()) as T
  }, retryOptions)
}

export async function fetchMediaPage(
  accessToken: string,
  cursor: string | null,
  options: GraphClientOptions = {},
): Promise<MediaPage> {
  const params: Record<string, string> = {
    access_token: accessToken,
    fields: "id,caption,media_type,media_url,permalink,timestamp",
    limit: "25",
  }
  if (cursor) params.after = cursor

  const body = await graphRequest<{
    data: InstagramMedia[]
    paging?: { cursors?: { after?: string }; next?: string }
  }>("/me/media", params, options)

  return {
    media: body.data ?? [],
    // cursors.after is present on the last page too. storing it there parks
    // the import past the end of the feed for good.
    nextCursor: body.paging?.next ? (body.paging.cursors?.after ?? null) : null,
  }
}

export async function refreshLongLivedToken(
  accessToken: string,
  options: GraphClientOptions = {},
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = await graphRequest<{ access_token: string; expires_in: number }>(
    "/refresh_access_token",
    { grant_type: "ig_refresh_token", access_token: accessToken },
    options,
  )

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
  }
}

// returns fields only, writing is the caller's job — keeps this testable
// without a database
export function mediaToPost(media: InstagramMedia, shopId: string, categoryId: string) {
  const caption = (media.caption ?? "").trim()
  const firstLine = caption.split("\n")[0] ?? ""

  return {
    shopId,
    categoryId,
    source: "instagram" as const,
    // idempotency key, the media edge overlaps between runs
    externalId: media.id,
    title: firstLine.slice(0, 120) || "Instagram post",
    body: caption,
    publishedAt: new Date(media.timestamp),
  }
}
