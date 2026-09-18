// --- Admin API probes ------------------------------------------------------
//
// Every Admin API call from this app comes back 403 with an empty body, which
// tells us nothing: the library wraps the response, and by the time an error
// reaches application code the headers are gone.
//
// These probes go around the library and call Shopify directly with the stored
// access token, so the raw status, headers and body are visible. They are
// ordered to split the problem rather than just restate it:
//
//   1. access_scopes  — UNVERSIONED. works with any live token. if this fails,
//                       the token itself is being refused and nothing about
//                       scopes, api version or graphql matters.
//   2. REST shop      — versioned REST. if 1 passes and this fails, the
//                       refusal is about the versioned API, not the token.
//   3. GraphQL shop   — versioned GraphQL, no special scope needed.
//   4. GraphQL install— currentAppInstallation needs no scope at all, so a 403
//                       here cannot be a missing-scope problem by definition.
//   5. GraphQL products — needs read_products, which the token reports having.
//                       separates "no scopes work" from "this scope is not
//                       really granted".
//
// The token is never returned, logged or rendered. Only its prefix, which
// identifies the kind of install and is the one genuinely diagnostic part.

export interface ProbeResult {
  label: string
  method: string
  path: string
  /** what a failure here would rule in or out */
  tells: string
  status: number | null
  ok: boolean
  requestId: string | null
  /** short, and never containing the token */
  detail: string
  error: string | null
}

const DIAGNOSTIC_HEADERS = [
  "x-request-id",
  "www-authenticate",
  "x-shopify-api-version",
  "x-shopify-api-deprecated-reason",
  "retry-after",
]

/**
 * The token prefix says what kind of credential this is, which is the thing
 * most worth knowing and the only part safe to show.
 *
 *   shpat_ offline token from a standard install
 *   shpca_ custom app token created in the admin
 *   shpua_ token issued to a user, not the app
 *
 * Anything else is unexpected and worth seeing verbatim-ish.
 */
export function describeToken(token: string | undefined): string {
  if (!token) return "(no access token on the session)"
  const underscore = token.indexOf("_")
  if (underscore > 0 && underscore <= 8) {
    return `${token.slice(0, underscore + 1)}… (${token.length} chars)`
  }
  return `(unrecognised shape, ${token.length} chars)`
}

function headerSummary(headers: Headers): string {
  return DIAGNOSTIC_HEADERS.map((name) => {
    const value = headers.get(name)
    return value ? `${name}: ${value}` : null
  })
    .filter(Boolean)
    .join("; ")
}

async function probe(
  spec: { label: string; method: string; path: string; tells: string; body?: unknown },
  shop: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const base: ProbeResult = {
    label: spec.label,
    method: spec.method,
    path: spec.path,
    tells: spec.tells,
    status: null,
    ok: false,
    requestId: null,
    detail: "",
    error: null,
  }

  try {
    const response = await fetchImpl(`https://${shop}${spec.path}`, {
      method: spec.method,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: spec.body ? JSON.stringify(spec.body) : undefined,
    })

    const text = await response.text().catch(() => "")
    const headers = headerSummary(response.headers)

    // a 200 carrying a GraphQL errors array is still a failure — graphql
    // answers 200 for things REST would answer 4xx for
    const graphqlErrors = text.includes('"errors"')

    return {
      ...base,
      status: response.status,
      ok: response.ok && !graphqlErrors,
      requestId: response.headers.get("x-request-id"),
      detail: [text.slice(0, 400), headers].filter(Boolean).join(" | ") || "(empty body)",
    }
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function probeAdminApi(
  shop: string,
  token: string | undefined,
  apiVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult[]> {
  if (!token) {
    return [
      {
        label: "Access token",
        method: "-",
        path: "-",
        tells: "There is no token on the session, so every call below would fail regardless.",
        status: null,
        ok: false,
        requestId: null,
        detail: "The session row has no accessToken. Reinstall the app.",
        error: "missing token",
      },
    ]
  }

  const specs = [
    {
      label: "Token is alive (unversioned)",
      method: "GET",
      path: "/admin/oauth/access_scopes.json",
      tells:
        "Works with any live token and ignores the API version. If this fails, the token itself is refused and nothing below can pass.",
    },
    {
      label: "REST shop",
      method: "GET",
      path: `/admin/api/${apiVersion}/shop.json`,
      tells:
        "Versioned REST. If the token is alive but this fails, the refusal is about the versioned API rather than the credential.",
    },
    {
      label: "GraphQL shop",
      method: "POST",
      path: `/admin/api/${apiVersion}/graphql.json`,
      tells: "If REST passes and this fails, the problem is specific to GraphQL.",
      body: { query: "{ shop { name ianaTimezone } }" },
    },
    {
      label: "GraphQL currentAppInstallation",
      method: "POST",
      path: `/admin/api/${apiVersion}/graphql.json`,
      tells:
        "Needs no access scope at all. A 403 here cannot be caused by a missing scope, which rules scopes out entirely.",
      body: { query: "{ currentAppInstallation { id } }" },
    },
    {
      label: "GraphQL products (read_products)",
      method: "POST",
      path: `/admin/api/${apiVersion}/graphql.json`,
      tells:
        "Needs read_products, which the token reports holding. Separates 'no scope works' from 'this scope was never really granted'.",
      body: { query: "{ products(first: 1) { nodes { id } } }" },
    },
  ]

  // sequential on purpose: five parallel calls against a shop that is already
  // refusing us is a good way to turn a 403 into a rate limit as well
  const results: ProbeResult[] = []
  for (const spec of specs) {
    results.push(await probe(spec, shop, token, fetchImpl))
  }
  return results
}

/**
 * Turn the probe results into the one sentence worth reading first.
 *
 * Deliberately conservative: it only claims what the results actually show,
 * because a confident wrong diagnosis here costs more than no diagnosis.
 */
export function summarise(results: ProbeResult[]): string {
  const byLabel = (needle: string) => results.find((r) => r.label.includes(needle))

  const alive = byLabel("Token is alive")
  const install = byLabel("currentAppInstallation")
  const rest = byLabel("REST shop")

  if (results.every((r) => r.ok)) {
    return "Every probe passed. The Admin API is working — if a page still shows an error, the fault is in that page rather than in access."
  }
  if (alive && !alive.ok) {
    return "The token is being refused on an unversioned endpoint that only needs a valid credential. This is not about scopes or API version — the install itself is not producing a working token. Reinstalling the app is the first thing to try."
  }
  // the REST check comes first because it is the more specific finding: if
  // REST works then the credential AND the versioned API are both fine, and
  // saying "the app's standing with Shopify" there would be a confident wrong
  // answer to a narrower question
  if (alive?.ok && rest?.ok && install && !install.ok) {
    return "REST works and GraphQL does not, with the same token on the same API version. That is a GraphQL-specific refusal, not an access problem."
  }
  if (alive?.ok && install && !install.ok) {
    return "The token is valid — the unversioned check passed — but a query that requires no scope at all is still refused. That rules out scopes and rules out the credential, which leaves the app's own status with Shopify as the remaining explanation."
  }
  return "Mixed results — read the rows below; each says what its own failure rules in or out."
}
