// all form validation lives here, server-side. the storefront posts through
// the app proxy and the admin posts through react router actions — both hit
// the same schemas, so there is one definition of what a valid post is.

import { z } from "zod"

const trimmed = (min: number, max: number) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().min(min).max(max))

/** lowercase, url-safe, stable. used in the storefront query string. */
export const handleSchema = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(2, "Handle must be at least 2 characters")
      .max(60, "Handle must be 60 characters or fewer")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens"),
  )

export const categorySchema = z.object({
  title: trimmed(2, 80),
  handle: handleSchema,
  isPrivate: z.coerce.boolean().default(false),
  position: z.coerce.number().int().min(0).max(999).default(0),
})

export const postSchema = z.object({
  title: trimmed(3, 120),
  body: trimmed(1, 10_000),
  categoryId: z.string().min(1, "Pick a category"),
})

export const commentSchema = z.object({
  body: trimmed(1, 5_000),
  parentId: z.string().min(1).optional(),
})

export const displayNameSchema = trimmed(1, 40)

export type CategoryInput = z.infer<typeof categorySchema>
export type PostInput = z.infer<typeof postSchema>
export type CommentInput = z.infer<typeof commentSchema>

/** field -> first error message, which is all a form needs to render. */
export type FieldErrors = Record<string, string>

export interface ParseFailure {
  ok: false
  errors: FieldErrors
}

export interface ParseSuccess<T> {
  ok: true
  data: T
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure

/**
 * Run a schema over FormData and flatten the result into something a form can
 * render directly. Checkboxes are absent from FormData when unticked, which
 * zod sees as undefined rather than false — handled by the coerce + default on
 * the boolean fields above.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): ParseResult<z.infer<T>> {
  const raw: Record<string, unknown> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") raw[key] = value
  }

  const result = schema.safeParse(raw)
  if (result.success) return { ok: true, data: result.data }

  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    const key = typeof field === "string" ? field : "form"
    // first error per field only; a list of five messages under one input is
    // noise, not help
    if (!errors[key]) errors[key] = issue.message
  }

  return { ok: false, errors }
}

/** Build a handle from a title, for the "leave blank and we'll fill it" case. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}
