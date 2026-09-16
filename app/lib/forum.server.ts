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
        _count: { select: { comments: true } },
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
  image: { url: string; width: number | null; height: number | null; alt: string | null },
) {
  // confirm the post is this shop's before attaching — PostImage has no shopId
  // of its own, so the scope has to be checked here
  const post = await prisma.post.findFirst({ where: { id: postId, shopId } })
  if (!post) return null

  const count = await prisma.postImage.count({ where: { postId } })
  return prisma.postImage.create({
    data: { postId, position: count, ...image },
  })
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

// --- members ---------------------------------------------------------------

export function listMembers(shopId: string) {
  return prisma.member.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { posts: true, comments: true } } },
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
  const [posts, comments, members, categories, recent] = await Promise.all([
    prisma.post.count({ where: { shopId } }),
    prisma.comment.count({ where: { shopId } }),
    prisma.member.count({ where: { shopId } }),
    prisma.category.count({ where: { shopId } }),
    prisma.post.findMany({
      where: { shopId },
      orderBy: { publishedAt: "desc" },
      take: 5,
      include: { category: true, author: true, _count: { select: { comments: true } } },
    }),
  ])

  return { counts: { posts, comments, members, categories }, recent }
}
