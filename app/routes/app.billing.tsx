import { Form, useLoaderData, useNavigation } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { Badge, Banner, Card, PageHeader } from "../components/ui"
import { FREE_POST_LIMIT, PRO_PLAN } from "../lib/plans"
import { appUrl, authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { billing } = await authenticate.admin(request)

  // check() only inspects; require() is the one that redirects to the charge
  // page. wrapped because the admin client throws on a non-2xx — a 403 here
  // would otherwise take down the page, and "we couldn't read your plan" is a
  // far better outcome than a dead screen.
  try {
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PRO_PLAN],
      isTest: process.env.NODE_ENV !== "production",
    })

    return {
      billingApiOk: true,
      hasActivePayment,
      subscriptionName: appSubscriptions[0]?.name ?? null,
    }
  } catch (error) {
    console.error("[billing] check failed:", error)
    return { billingApiOk: false, hasActivePayment: false, subscriptionName: null }
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request)

  // throws a redirect to shopify's confirmation page. the merchant approves
  // there, never in our own ui — app review checks for this.
  await billing.request({
    plan: PRO_PLAN,
    isTest: process.env.NODE_ENV !== "production",
    returnUrl: `${appUrl}/app/billing`,
  })

  return null
}

export default function Billing() {
  const { hasActivePayment, subscriptionName, billingApiOk } = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const busy = navigation.state !== "idle"

  return (
    <div className="page">
      <PageHeader title="Plan" subtitle="Billing is handled by Shopify, not by this app." />

      {!billingApiOk ? (
        <Banner tone="warning" title="Plan status unavailable">
          The Billing API could not be reached. This usually means the app is not approved for the
          scopes it requests.
        </Banner>
      ) : null}

      <Card title="Current plan">
        {hasActivePayment ? (
          <div className="inline">
            <Badge tone="success">Active</Badge>
            <span>{subscriptionName ?? PRO_PLAN}</span>
          </div>
        ) : (
          <>
            <div className="inline" style={{ marginBottom: 12 }}>
              <Badge tone="neutral">Free</Badge>
              <span className="cell-muted">Capped at {FREE_POST_LIMIT} posts</span>
            </div>
            <p style={{ marginTop: 0 }}>
              Pro removes the post cap. Approving the charge happens on Shopify&rsquo;s own
              confirmation page.
            </p>
            <Form method="post">
              <button type="submit" className="btn btn--primary" disabled={busy || !billingApiOk}>
                {busy ? "Redirecting…" : "Upgrade to Pro — $9.99/month"}
              </button>
            </Form>
          </>
        )}
      </Card>

      <Card title="Test mode">
        <p className="cell-muted" style={{ marginTop: 0 }}>
          Charges are created with <code>isTest</code> set from <code>NODE_ENV</code>, so nothing
          on a development store is ever really billed. On a production deploy this flips
          automatically.
        </p>
      </Card>
    </div>
  )
}
