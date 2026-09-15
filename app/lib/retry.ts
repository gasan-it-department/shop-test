// --- retry / backoff for third-party APIs -----------------------------------
// sleep is injected so tests assert the delay sequence without waiting

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message ?? `HTTP ${status}`)
    this.name = "HttpError"
  }
}

export interface RetryOptions {
  /** retries AFTER the first attempt, so 3 => up to 4 calls */
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  isRetryable?: (error: unknown) => boolean
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// 4xx other than 429 means the request was wrong, repeating it just burns
// rate limit. no status = network error, worth retrying.
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) {
    return error.status === 429 || error.status >= 500
  }
  return error instanceof Error
}

// full jitter, not fixed exponential: a whole queue hitting the same limit
// would otherwise retry in lockstep and trip it again
export function computeDelay(
  attempt: number,
  { baseDelayMs = 250, maxDelayMs = 30_000, random = Math.random }: RetryOptions = {},
  retryAfterMs?: number,
): number {
  if (typeof retryAfterMs === "number" && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, maxDelayMs)
  }
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
  return Math.round(random() * exponential)
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    sleep = defaultSleep,
    isRetryable = isRetryableError,
    onRetry,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error

      if (attempt === retries || !isRetryable(error)) throw error

      const retryAfterMs = error instanceof HttpError ? error.retryAfterMs : undefined
      const delayMs = computeDelay(attempt, options, retryAfterMs)
      onRetry?.({ attempt, delayMs, error })
      await sleep(delayMs)
    }
  }

  throw lastError
}

// Retry-After is either seconds or an HTTP date
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined

  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)

  const date = Date.parse(header)
  if (Number.isNaN(date)) return undefined

  return Math.max(0, date - now)
}
