// --- pseudonymous ids + gdpr anonymisation ----------------------------------
// no ip, no password, no customer id in the clear

import { createHmac, timingSafeEqual } from "node:crypto"

// length-prefixed, not separator-joined: the customer id comes off a webhook
// payload so it can contain whatever the separator is
export function shopperHash(
  shopDomain: string,
  customerId: string | number,
  secret = process.env.SHOPPER_HASH_SECRET,
): string {
  if (!secret) {
    throw new Error("SHOPPER_HASH_SECRET is not set — refusing to store an unhashed customer id")
  }

  const id = String(customerId)
  const encoded = `${shopDomain.length}:${shopDomain}${id.length}:${id}`

  return createHmac("sha256", secret).update(encoded).digest("hex")
}

export interface AnonymisedMember {
  displayName: string
  avatarUrl: null
  shopperHash: string
  anonymisedAt: Date
}

// fields to write on customers/redact. posts and comments survive, deleting
// them would gut threads other people are reading. the hash is replaced so a
// later login can't re-attach.
export function anonymiseMember(
  memberId: string,
  now: Date = new Date(),
): AnonymisedMember {
  return {
    displayName: "Deleted member",
    avatarUrl: null,
    shopperHash: `redacted:${createHmac("sha256", memberId).update(now.toISOString()).digest("hex")}`,
    anonymisedAt: now,
  }
}

export interface DataRequestExport {
  shop: string
  member: { displayName: string; joinedAt: string } | null
  posts: Array<{ title: string; body: string; publishedAt: string }>
  comments: Array<{ body: string; createdAt: string }>
  note: string
}

export function emptyDataExport(shop: string): DataRequestExport {
  return {
    shop,
    member: null,
    posts: [],
    comments: [],
    note: "No forum activity is stored for this customer. This app stores no IP addresses and no passwords.",
  }
}

// for proxy signatures and webhook hmacs. === leaks length and prefix.
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
