import { describe, expect, it, vi } from "vitest"

import {
  HttpError,
  computeDelay,
  isRetryableError,
  parseRetryAfter,
  withRetry,
} from "../app/lib/retry"

/** records delays instead of waiting them out */
function recordingSleep() {
  const delays: number[] = []
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms)
    },
  }
}

describe("isRetryableError", () => {
  it("retries 429 and 5xx", () => {
    expect(isRetryableError(new HttpError(429))).toBe(true)
    expect(isRetryableError(new HttpError(500))).toBe(true)
    expect(isRetryableError(new HttpError(503))).toBe(true)
  })

  it("does not retry a 4xx that is not 429", () => {
    expect(isRetryableError(new HttpError(400))).toBe(false)
    expect(isRetryableError(new HttpError(401))).toBe(false)
    expect(isRetryableError(new HttpError(404))).toBe(false)
  })

  it("retries bare network errors, which carry no status", () => {
    expect(isRetryableError(new Error("ECONNRESET"))).toBe(true)
  })
})

describe("computeDelay", () => {
  it("grows exponentially from the base delay", () => {
    const opts = { baseDelayMs: 250, random: () => 1 }
    expect(computeDelay(0, opts)).toBe(250)
    expect(computeDelay(1, opts)).toBe(500)
    expect(computeDelay(2, opts)).toBe(1000)
    expect(computeDelay(3, opts)).toBe(2000)
  })

  it("caps at maxDelayMs", () => {
    expect(computeDelay(20, { baseDelayMs: 250, maxDelayMs: 30_000, random: () => 1 })).toBe(30_000)
  })

  it("applies full jitter, so a fleet of workers does not retry in lockstep", () => {
    expect(computeDelay(3, { baseDelayMs: 250, random: () => 0 })).toBe(0)
    expect(computeDelay(3, { baseDelayMs: 250, random: () => 0.5 })).toBe(1000)
  })

  it("honours Retry-After over its own backoff", () => {
    expect(computeDelay(0, { baseDelayMs: 250, random: () => 1 }, 5_000)).toBe(5_000)
  })

  it("still caps a hostile Retry-After", () => {
    expect(computeDelay(0, { maxDelayMs: 30_000 }, 86_400_000)).toBe(30_000)
  })
})

describe("withRetry", () => {
  it("does not retry a call that succeeds", async () => {
    const fn = vi.fn().mockResolvedValue("ok")
    const { sleep, delays } = recordingSleep()

    await expect(withRetry(fn, { sleep })).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it("retries a 500 and returns the eventual success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500))
      .mockRejectedValueOnce(new HttpError(500))
      .mockResolvedValue("ok")
    const { sleep, delays } = recordingSleep()

    await expect(
      withRetry(fn, { sleep, random: () => 1, baseDelayMs: 100 }),
    ).resolves.toBe("ok")
    expect(fn).toHaveBeenCalledTimes(3)
    expect(delays).toEqual([100, 200])
  })

  it("gives up after the configured number of retries", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(503))
    const { sleep, delays } = recordingSleep()

    await expect(withRetry(fn, { sleep, retries: 2 })).rejects.toBeInstanceOf(HttpError)
    expect(fn).toHaveBeenCalledTimes(3) // 1 attempt + 2 retries
    expect(delays).toHaveLength(2)
  })

  it("fails fast on a non-retryable error rather than burning rate limit", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(422, "Unprocessable"))
    const { sleep, delays } = recordingSleep()

    await expect(withRetry(fn, { sleep })).rejects.toThrow("Unprocessable")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it("waits exactly as long as a 429 asked it to", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(429, "Too many", 4_000))
      .mockResolvedValue("ok")
    const { sleep, delays } = recordingSleep()

    await withRetry(fn, { sleep })
    expect(delays).toEqual([4_000])
  })

  it("reports each retry to onRetry for logging", async () => {
    const onRetry = vi.fn()
    const fn = vi.fn().mockRejectedValueOnce(new HttpError(500)).mockResolvedValue("ok")
    const { sleep } = recordingSleep()

    await withRetry(fn, { sleep, onRetry })
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 0 })
  })
})

describe("the retry assertions catch a broken backoff", () => {
  it("notices an implementation that ignores Retry-After", async () => {
    // always uses its own curve, so against a 429 asking for 4s it retries
    // after 100ms — that's how you earn an application-level block
    const brokenDelay = (attempt: number) => 100 * 2 ** attempt

    expect(brokenDelay(0)).not.toBe(4_000)
    expect(computeDelay(0, { baseDelayMs: 100 }, 4_000)).toBe(4_000)
  })

  it("notices an implementation that retries non-retryable 4xx", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(400))
    const { sleep } = recordingSleep()

    // forced to treat everything as retryable, the call count jumps
    await expect(
      withRetry(fn, { sleep, retries: 3, isRetryable: () => true }),
    ).rejects.toBeInstanceOf(HttpError)
    expect(fn).toHaveBeenCalledTimes(4)

    fn.mockClear()
    await expect(withRetry(fn, { sleep, retries: 3 })).rejects.toBeInstanceOf(HttpError)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("parseRetryAfter", () => {
  it("reads a delay in seconds", () => {
    expect(parseRetryAfter("2")).toBe(2_000)
    expect(parseRetryAfter("0")).toBe(0)
  })

  it("reads an HTTP date", () => {
    const now = Date.parse("2026-01-01T00:00:00Z")
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000)
  })

  it("never returns a negative delay for a date in the past", () => {
    const now = Date.parse("2026-01-01T00:01:00Z")
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0)
  })

  it("returns undefined for a missing or unparseable header", () => {
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter("soon")).toBeUndefined()
  })
})
