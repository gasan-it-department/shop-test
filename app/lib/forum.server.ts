// data access for the forum. every function takes a shopId and filters on it.
//
// the scoping is the point: an admin route gets its shop from the session, and
// nothing here will read or write a row belonging to another merchant even if
// an id is guessed. the `where: { id, shopId }` pairs are deliberate — a bare
// `where: { id }` would be a cross-tenant leak.

import type { Prisma } from "@prisma/client"

import prisma from "../db.server"
import { anonymiseMember } from "./privacy.server"

/**
 * The Shop row for this session, created if missing.
 *
 * afterAuth creates it on install, but an install that predates the hook — or
 * one where the upsert failed and was logged rather than thrown — would leave
 * the admin with no row. Upserting here means the admin always works.
 */
export function requireShop(domain: string) {
  return prisma.shop.upsert({
    where: { domain },
    update: {},
    create: { domain },
  })
}

// --- categories ------------------------------------------------------------

export function listCategories(shopId: string) {
  return prisma.category.findMany({
    where: { shopId },
    orderBy: [{ position: "asc" }, { title: "asc" }],
    include: { _count: { select: { posts: true } } },
  })
}

export function getCategory(shopId: string, id: string) {
  return prisma.category.findFirst({ where: { id, shopId } })
}

export function createCategory(
  shopId: string,
  data: { title: string; handle: string; isPrivate: boolean; position: number },
) {
  return prisma.category.create({ data: { shopId, ...data } })
}

export function updateCategory(
  shopId: string,
  id: string,
  data: { title: string; handle: string; isPrivate: boolean; position: number },
) {
  // updateMany rather than update: it takes a filter, so shopId is enforced.
  // update() only accepts a unique field and would ignore the scope.
  return prisma.category.updateMany({ where: { id, shopId }, data })
}

export function deleteCategory(shopId: string, id: string) {
  // posts cascade with the category — the schema says onDelete: Cascade
  return prisma.category.deleteMany({ where: { id, shopId } })
}

// --- posts -----------------------------------------------------------------

export interface PostFilters {
  categoryId?: string
  search?: string
  take?: number
  skip?: number
}

function postWhere(shopId: string, filters: PostFilters): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = { shopId }
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.search) {
    // postgres ILIKE via mode: "insensitive" — on sqlite this silently did
    // nothing, which is one of the reasons the migration mattered
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { body: { contains: filters.search, mode: "insensitive" } },
    ]
  }
  return where
}

export async function listPosts(shopId: string, filters: PostFilters = {}) {
  const where = postWhere(shopId, filters)
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      take: filters.take ?? 25,
      skip: filters.skip ?? 0,
      include: {
        category: true,
        author: true,
        images: { orderBy: { position: "asc" }, take: 1 },
        _count: { select: { comments: true, reactions: true } },
      },
    }),
    prisma.post.count({ where }),
  ])
  return { items, total }
}

export function getPost(shopId: string, id: string) {
  return prisma.post.findFirst({
    where: { id, shopId },
    include: {
      _count: { select: { reactions: true } },
      category: true,
      author: true,
      images: { orderBy: { position: "asc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: true },
      },
    },
  })
}

export async function addPostImage(
  shopId: string,
  postId: string,
  image: {
    data?: Uint8Array | null
    contentType?: string | null
    url?: string | null
    width?: number | null
    height?: number | null
    alt?: string | null
  },
) {
  // confirm the post is this shop's before attaching — PostImage has no shopId
  // of its own, so the scope has to be checked here
  const post = await prisma.post.findFirst({ where: { id: postId, shopId } })
  if (!post) return null

  const count = await prisma.postImage.count({ where: { postId } })
  return prisma.postImage.create({
    data: {
      postId,
      position: count,
      // prisma types Bytes as Uint8Array<ArrayBuffer>; a Buffer or a view over
      // a SharedArrayBuffer does not satisfy that, so normalise here
      data: image.data ? new Uint8Array(image.data) : null,
      contentType: image.contentType ?? null,
      url: image.url ?? null,
      width: image.width ?? null,
      height: image.height ?? null,
      alt: image.alt ?? null,
    },
  })
}

/**
 * Where to load an image from: an external url if it has one, otherwise this
 * app's own route.
 *
 * `baseUrl` is required on the storefront — the markup renders on the shop's
 * domain, so a relative path would resolve against the shop and 404.
 */
export function imageSrc(
  image: { id: string; url?: string | null },
  baseUrl = "",
): string {
  return image.url ?? `${baseUrl}/images/${image.id}`
}

export async function deletePostImage(shopId: string, postId: string, imageId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, shopId } })
  if (!post) return false

  // the bytes stay in Shopify Files. removing them there too would break any
  // other post that reused the same url, and the merchant owns those files.
  await prisma.postImage.deleteMany({ where: { id: imageId, postId } })
  return true
}

export function createPost(
  shopId: string,
  data: { title: string; body: string; categoryId: string; authorId?: string | null },
) {
  return prisma.post.create({
    data: {
      shopId,
      categoryId: data.categoryId,
      authorId: data.authorId ?? null,
      title: data.title,
      body: data.body,
    },
  })
}

export function updatePost(
  shopId: string,
  id: string,
  data: { title: string; body: string; categoryId: string },
) {
  return prisma.post.updateMany({ where: { id, shopId }, data })
}

export function deletePost(shopId: string, id: string) {
  return prisma.post.deleteMany({ where: { id, shopId } })
}

// --- comments --------------------------------------------------------------

export function createComment(
  shopId: string,
  data: { postId: string; body: string; authorId?: string | null; parentId?: string | null },
) {
  return prisma.comment.create({
    data: {
      shopId,
      postId: data.postId,
      body: data.body,
      authorId: data.authorId ?? null,
      parentId: data.parentId ?? null,
    },
  })
}

export function deleteComment(shopId: string, id: string) {
  return prisma.comment.deleteMany({ where: { id, shopId } })
}

export interface CommentFilters {
  search?: string
  postId?: string
  take?: number
  skip?: number
}

/**
 * Every comment on the shop, newest first.
 *
 * Moderation happened per-post before this, which works only if you already
 * know which post the problem is on. The thing a merchant actually wants to
 * see is what was just said anywhere on their forum.
 */
export async function listComments(shopId: string, filters: CommentFilters = {}) {
  const where: Prisma.CommentWhereInput = { shopId }
  if (filters.search) where.body = { contains: filters.search, mode: "insensitive" }
  if (filters.postId) where.postId = filters.postId

  const [items, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.take ?? 25,
      skip: filters.skip ?? 0,
      include: {
        author: true,
        post: { select: { id: true, title: true } },
      },
    }),
    prisma.comment.count({ where }),
  ])
  return { items, total }
}

// --- likes -----------------------------------------------------------------

/**
 * The reaction kind stored in `Reaction.emoji`.
 *
 * A token, not "❤️". The emoji has two encodings that differ only by a
 * variant selector (U+FE0F), and a code path writing one while another queries
 * the other would satisfy the unique constraint twice over and double-count
 * the same person.
 */
export const HEART = "heart"

export interface LikeState {
  count: number
  liked: boolean
}

/**
 * Like counts for a page of posts, plus whether this member left one.
 *
 * Two queries for the whole page rather than two per post: a feed of 20 cards
 * asking individually is 40 round trips, and it is the kind of N+1 that only
 * shows up once a shop has real traffic.
 */
export async function likeSummary(
  postIds: string[],
  memberId: string | null,
): Promise<Map<string, LikeState>> {
  const summary = new Map<string, LikeState>()
  if (postIds.length === 0) return summary

  const [counts, mine] = await Promise.all([
    prisma.reaction.groupBy({
      by: ["postId"],
      where: { postId: { in: postIds }, emoji: HEART },
      _count: { _all: true },
    }),
    // an anonymous visitor has nothing to look up
    memberId
      ? prisma.reaction.findMany({
          where: { postId: { in: postIds }, emoji: HEART, memberId },
          select: { postId: true },
        })
      : Promise.resolve([]),
  ])

  for (const id of postIds) summary.set(id, { count: 0, liked: false })
  for (const row of counts) {
    summary.set(row.postId, { count: row._count._all, liked: false })
  }
  for (const row of mine) {
    const state = summary.get(row.postId)
    if (state) state.liked = true
  }

  return summary
}

/**
 * Add or remove this member's heart, and report the resulting state.
 *
 * Delete first and create only if nothing was deleted, so the whole toggle is
 * two statements with no transaction and no row lock. Two taps that race can
 * interleave — one deletes while the other creates — and the end state is
 * whichever landed last rather than a guaranteed flip. That is the right
 * trade: the response carries the true count and the client re-syncs to it,
 * whereas locking the row would serialise every like on a popular post.
 *
 * Returns null when the post isn't this shop's or isn't publicly readable, so
 * a guessed id can't be used to probe for private categories.
 */
export async function toggleLike(
  shopId: string,
  postId: string,
  memberId: string,
): Promise<LikeState | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, shopId, category: { isPrivate: false } },
    select: { id: true },
  })
  if (!post) return null

  const removed = await prisma.reaction.deleteMany({
    where: { postId, memberId, emoji: HEART },
  })

  let liked = false
  if (removed.count === 0) {
    try {
      await prisma.reaction.create({ data: { shopId, postId, memberId, emoji: HEART } })
      liked = true
    } catch (error) {
      // P2002 is the unique constraint: a concurrent tap already created the
      // row. That is the state this request wanted, so it is a success, not a
      // 500. Anything else is a real failure and must not be swallowed.
      if (!isUniqueViolation(error)) throw error
      liked = true
    }
  }

  const count = await prisma.reaction.count({ where: { postId, emoji: HEART } })
  return { count, liked }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  )
}

// --- members ---------------------------------------------------------------

export interface MemberFilters {
  search?: string
  /** true for redacted only, false for active only, undefined for both */
  anonymised?: boolean
  take?: number
  skip?: number
}

/**
 * A page of members, with a total so the admin can paginate.
 *
 * This used to be a bare `take: 100` with no total and no filter, which on a
 * shop with more than a hundred members silently showed the newest hundred and
 * gave no indication the rest existed.
 *
 * `_count.reactions` is the number of likes this member has given. Reaction
 * only ever holds hearts — see HEART — so the unfiltered count is the like
 * count; if a second reaction kind is ever added this has to become a
 * filtered count.
 */
export async function listMembers(shopId: string, filters: MemberFilters = {}) {
  const where: Prisma.MemberWhereInput = { shopId }
  if (filters.search) {
    where.displayName = { contains: filters.search, mode: "insensitive" }
  }
  if (filters.anonymised === true) where.anonymisedAt = { not: null }
  if (filters.anonymised === false) where.anonymisedAt = null

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.take ?? 25,
      skip: filters.skip ?? 0,
      include: { _count: { select: { posts: true, comments: true, reactions: true } } },
    }),
    prisma.member.count({ where }),
  ])
  return { items, total }
}

/**
 * One member with what they have actually done, for the admin's member page.
 *
 * The counts are the whole history; the two lists are the most recent handful,
 * which is what a merchant looking someone up is deciding on.
 */
export function getMember(shopId: string, id: string) {
  return prisma.member.findFirst({
    where: { id, shopId },
    include: {
      _count: { select: { posts: true, comments: true, reactions: true } },
      posts: {
        orderBy: { publishedAt: "desc" },
        take: 10,
        include: { category: true, _count: { select: { comments: true } } },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { post: { select: { id: true, title: true } } },
      },
    },
  })
}

/**
 * Anonymise a member from the admin, using the same code path the
 * customers/redact webhook uses. Two implementations of "forget this person"
 * is how one of them ends up not actually forgetting them.
 */
export async function anonymiseMemberById(shopId: string, id: string) {
  const member = await prisma.member.findFirst({ where: { id, shopId } })
  if (!member) return false

  await prisma.member.update({
    where: { id: member.id },
    data: anonymiseMember(member.id),
  })
  return true
}

// --- dashboard -------------------------------------------------------------

export async function shopOverview(shopId: string) {
  const [posts, comments, members, categories, likes, recent] = await Promise.all([
    prisma.post.count({ where: { shopId } }),
    prisma.comment.count({ where: { shopId } }),
    prisma.member.count({ where: { shopId } }),
    prisma.category.count({ where: { shopId } }),
    prisma.reaction.count({ where: { shopId, emoji: HEART } }),
    prisma.post.findMany({
      where: { shopId },
      orderBy: { publishedAt: "desc" },
      take: 5,
      include: {
        category: true,
        author: true,
        _count: { select: { comments: true, reactions: true } },
      },
    }),
  ])

  return { counts: { posts, comments, members, categories, likes }, recent }
}
