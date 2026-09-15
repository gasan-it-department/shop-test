import { Form, useLoaderData } from "react-router"
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router"

import { FREE_POST_LIMIT, PRO_PLAN } from "../lib/plans"
import { appUrl, authenticate } from "../shopify.server"

export async function loader({ request }: LoaderFunctionArgs) {
  const { billing } = await authenticate.admin(request)

  // check() only inspects. require() is the one that redirects to the charge
  // page.
  //
  // wrapped because the admin client throws on a non-2xx — a 403 here would
  // otherwise 500 the page, and "we couldn't read your plan" is a far better
  // outcome than a dead screen.
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
  // there, never in our own UI — app review checks for this.
  await billing.request({
    plan: PRO_PLAN,
    isTest: process.env.NODE_ENV !== "production",
    // normalised, so no doubled slash if the env var had a trailing one
    returnUrl: `${appUrl}/app/billing`,
  })

  return null
}

export default function Billing() {
  const { hasActivePayment, subscriptionName, billingApiOk } = useLoaderData<typeof loader>()

  if (!billingApiOk) {
    return (
      <s-page heading="Plan">
        <s-section>
          <s-banner tone="warning" heading="Plan status unavailable">
            <s-paragraph>
              The Billing API could not be reached. This usually means the app
              is not yet approved for the scopes it requests.
            </s-paragraph>
          </s-banner>
        </s-section>
      </s-page>
    )
  }

  return (
    <s-page heading="Plan">
      <s-section>
        {hasActivePayment ? (
          <s-stack direction="inline" gap="small">
            <s-text>Active subscription</s-text>
            <s-badge tone="success">{subscriptionName ?? PRO_PLAN}</s-badge>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              {`The forum is on the free tier, capped at ${FREE_POST_LIMIT} posts. Pro removes the cap.`}
            </s-paragraph>
            <Form method="post">
              <s-button type="submit" variant="primary">
                Upgrade to Pro — $9.99/month
              </s-button>
            </Form>
          </s-stack>
        )}
      </s-section>
    </s-page>
  )
}
