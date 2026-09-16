// --- uploading images to shopify files --------------------------------------
//
// three calls, in order, and skipping any of them fails in a confusing way:
//
//   1. stagedUploadsCreate  -> a one-time signed target on shopify's storage
//   2. POST the bytes       -> multipart, with the returned params FIRST and
//                              the file field LAST. the order is not optional.
//   3. fileCreate           -> registers the uploaded object as a MediaImage
//   4. poll until READY     -> fileCreate returns before processing finishes,
//                              so image.url is null if you read it immediately
//
// the alternative was bytea in postgres, which turns every backup into an
// image archive and serves every photo through node with no cdn.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const

export interface UploadedImage {
  url: string
  width: number | null
  height: number | null
  alt: string | null
}

/** the shape of `admin.graphql` from authenticate.admin */
export type GraphqlFn = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<Response>

export interface UploadOptions {
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** how many times to poll for READY before giving up */
  pollAttempts?: number
  pollIntervalMs?: number
}

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageUploadError"
  }
}

/**
 * Turn whatever the admin client threw into a readable string.
 *
 * It throws the `Response` itself on a non-2xx, and logging that object prints
 * `Response { status: 403, body: ReadableStream }` — which says nothing. The
 * reason is in the body, and it has to be read before it is any use.
 */
export async function describeAdminError(error: unknown): Promise<string> {
  if (error instanceof Response) {
    const text = await error.text().catch(() => "")
    return `HTTP ${error.status} ${text}`.trim()
  }
  if (error instanceof Error) return error.message
  return String(error)
}

/** rejects anything we would not want a merchant — or a shopper — sending */
export function validateImage(file: {
  size: number
  type: string
  name: string
}): string | null {
  if (file.size === 0) return "That file is empty"
  if (file.size > MAX_IMAGE_BYTES) {
    return `Images must be ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB or smaller`
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "Only JPEG, PNG, WebP and GIF images are supported"
  }
  return null
}

const STAGED_UPLOADS = `#graphql
  mutation StagedUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters { name value }
      }
      userErrors { field message }
    }
  }
`

const FILE_CREATE = `#graphql
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        ... on MediaImage { image { url width height } }
      }
      userErrors { field message }
    }
  }
`

const FILE_STATUS = `#graphql
  query FileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        fileStatus
        alt
        image { url width height }
      }
    }
  }
`

interface StagedTarget {
  url: string
  resourceUrl: string
  parameters: Array<{ name: string; value: string }>
}

async function graphqlJson<T>(
  graphql: GraphqlFn,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await graphql(query, { variables })
  const body = (await response.json()) as { data?: T; errors?: unknown }
  if (!body.data) {
    throw new ImageUploadError(`Shopify rejected the request: ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

function firstUserError(errors: Array<{ message: string }> | undefined): string | null {
  return errors && errors.length > 0 ? errors[0].message : null
}

export async function uploadImageToShopify(
  graphql: GraphqlFn,
  file: File,
  alt: string,
  options: UploadOptions = {},
): Promise<UploadedImage> {
  const {
    fetchImpl = fetch,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    pollAttempts = 10,
    pollIntervalMs = 700,
  } = options

  // 1. ask for a signed target
  const staged = await graphqlJson<{
    stagedUploadsCreate: {
      stagedTargets: StagedTarget[]
      userErrors: Array<{ message: string }>
    }
  }>(graphql, STAGED_UPLOADS, {
    input: [
      {
        filename: file.name,
        mimeType: file.type,
        resource: "IMAGE",
        httpMethod: "POST",
        fileSize: String(file.size),
      },
    ],
  })

  const stagedError = firstUserError(staged.stagedUploadsCreate.userErrors)
  if (stagedError) throw new ImageUploadError(stagedError)

  const target = staged.stagedUploadsCreate.stagedTargets[0]
  if (!target) throw new ImageUploadError("Shopify returned no upload target")

  // 2. send the bytes. the signed parameters must be appended before the file
  // field or the storage backend rejects the signature.
  const form = new FormData()
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value)
  }
  form.append("file", file)

  const upload = await fetchImpl(target.url, { method: "POST", body: form })
  if (!upload.ok) {
    throw new ImageUploadError(`Upload failed with ${upload.status}`)
  }

  // 3. register it as a file on the shop
  const created = await graphqlJson<{
    fileCreate: {
      files: Array<{
        id: string
        fileStatus: string
        alt: string | null
        image?: { url: string; width: number | null; height: number | null } | null
      }>
      userErrors: Array<{ message: string }>
    }
  }>(graphql, FILE_CREATE, {
    files: [{ originalSource: target.resourceUrl, contentType: "IMAGE", alt }],
  })

  const createError = firstUserError(created.fileCreate.userErrors)
  if (createError) throw new ImageUploadError(createError)

  const created0 = created.fileCreate.files[0]
  if (!created0) throw new ImageUploadError("Shopify returned no file")

  if (created0.fileStatus === "READY" && created0.image?.url) {
    return {
      url: created0.image.url,
      width: created0.image.width ?? null,
      height: created0.image.height ?? null,
      alt: created0.alt ?? alt,
    }
  }

  // 4. processing is async — fileCreate returns before the cdn url exists
  for (let attempt = 0; attempt < pollAttempts; attempt++) {
    await sleep(pollIntervalMs)

    const polled = await graphqlJson<{
      node: {
        fileStatus: string
        alt: string | null
        image?: { url: string; width: number | null; height: number | null } | null
      } | null
    }>(graphql, FILE_STATUS, { id: created0.id })

    const node = polled.node
    if (!node) continue

    if (node.fileStatus === "FAILED") {
      throw new ImageUploadError("Shopify could not process that image")
    }

    if (node.fileStatus === "READY" && node.image?.url) {
      return {
        url: node.image.url,
        width: node.image.width ?? null,
        height: node.image.height ?? null,
        alt: node.alt ?? alt,
      }
    }
  }

  throw new ImageUploadError("Timed out waiting for Shopify to process the image")
}
