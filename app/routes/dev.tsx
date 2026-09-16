// --- local dev harness, 404s in production ----------------------------------
// /app is behind oauth and the widget normally lives in a merchant's theme, so
// without this there's nothing to look at locally. runs the real extension
// script from disk against the real fragment.
//
// the hostile theme toggle injects the sort of css a bad theme ships. if
// anything in the widget moves, the shadow root isn't doing its job.

import { readFile } from "node:fs/promises"
import path from "node:path"

import { useState } from "react"
import { useLoaderData } from "react-router"

import prisma from "../db.server"
import { assertDevHarness } from "../lib/dev-mode.server"

export async function loader() {
  assertDevHarness()

  // extensions/ ships with the repo, but a host that prunes it shouldn't take
  // the whole page down
  let widgetScript = ""
  try {
    widgetScript = await readFile(
      path.join(process.cwd(), "extensions/forum-embed/assets/forum.js"),
      "utf8",
    )
  } catch {
    console.warn("[dev] forum.js not found, widget preview disabled")
  }

  const shop = await prisma.shop.findFirst({ orderBy: { createdAt: "asc" } })

  return {
    widgetScript,
    shop: shop?.domain ?? null,
    counts: shop
      ? {
          posts: await prisma.post.count({ where: { shopId: shop.id } }),
          publicPosts: await prisma.post.count({
            where: { shopId: shop.id, category: { isPrivate: false } },
          }),
          comments: await prisma.comment.count({ where: { shopId: shop.id } }),
          members: await prisma.member.count({ where: { shopId: shop.id } }),
        }
      : null,
  }
}

const PAGE_CSS = `
  :root { color-scheme: light }
  body { margin: 0; background: #fcfcfc; color: #1a1a1a;
         font: 400 14px/1.55 Inter, system-ui, -apple-system, sans-serif }
  .shell { max-width: 1080px; margin: 0 auto; padding: 32px 24px 64px }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em }
  .sub { color: #6b6b6b; margin: 0 0 28px }
  .grid { display: grid; grid-template-columns: 1fr 340px; gap: 20px; align-items: start }
  @media (max-width: 860px) { .grid { grid-template-columns: 1fr } }
  .panel { border: 1px solid #e8e8e8; border-radius: 10px; background: #fff; overflow: hidden }
  .panel__head { padding: 12px 16px; border-bottom: 1px solid #f0f0f0;
                 display: flex; align-items: center; justify-content: space-between; gap: 12px }
  .panel__title { font-weight: 600; font-size: 13px }
  .panel__body { padding: 16px }
  .muted { color: #6b6b6b }
  .stats { display: flex; gap: 24px; flex-wrap: wrap; margin: 0; padding: 0; list-style: none }
  .stats dt { font-size: 12px; color: #6b6b6b }
  .stats dd { margin: 0; font-size: 18px; font-weight: 600 }
  .rows { list-style: none; margin: 0; padding: 0 }
  .rows li { display: flex; justify-content: space-between; gap: 12px;
             padding: 9px 0; border-bottom: 1px solid #f2f2f2 }
  .rows li:last-child { border-bottom: 0 }
  .rows code { font: 12px/1.4 ui-monospace, "Cascadia Code", Consolas, monospace }
  .ok   { color: #0f6b3f; background: #eaf5ef; border-radius: 99px; padding: 1px 8px; font-size: 12px }
  .warn { color: #7a5200; background: #fdf3e0; border-radius: 99px; padding: 1px 8px; font-size: 12px }
  .toggle { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #4a4a4a }
  .note { font-size: 12px; color: #6b6b6b; margin: 12px 0 0 }
  .empty { border: 1px dashed #dcdcdc; border-radius: 8px; padding: 20px; text-align: center }
  .empty code { background: #f4f4f4; border-radius: 4px; padding: 2px 6px;
                font: 12px ui-monospace, Consolas, monospace }
`

// every rule here would wreck an un-isolated widget, none of it crosses a
// shadow boundary
const HOSTILE_CSS = `
  .theme-sim * { box-sizing: content-box !important; font-family: "Comic Sans MS", cursive !important }
  .theme-sim ul { list-style: square inside !important; padding-left: 40px !important;
                  background: #ffe9e9 !important }
  .theme-sim li { border: 2px dotted #c00 !important; margin: 12px 0 !important;
                  text-transform: uppercase !important }
  .theme-sim h3 { font-size: 34px !important; color: #c00 !important; letter-spacing: 3px !important }
  .theme-sim a { color: #f0f !important; text-decoration: underline wavy !important }
  .theme-sim p { display: none !important }
`

export default function Dev() {
  const { widgetScript, shop, counts } = useLoaderData<typeof loader>()
  const [hostile, setHostile] = useState(false)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      {hostile ? <style dangerouslySetInnerHTML={{ __html: HOSTILE_CSS }} /> : null}

      <div className="shell">
        <h1>Local dev harness</h1>
        <p className="sub">
          Dev only, 404s in production. Nothing here talks to Shopify.
        </p>

        <div className="grid">
          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Storefront widget</span>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={hostile}
                  onChange={(event) => setHostile(event.target.checked)}
                />
                Simulate a hostile theme
              </label>
            </div>
            <div className="panel__body">
              {counts && counts.publicPosts > 0 ? (
                <div className={hostile ? "theme-sim" : undefined}>
                  {/* same markup the liquid block renders. suppressHydration
                      because forum.js runs during html parse and stamps
                      data-forum-mounted before react hydrates — a real theme
                      has no react on the page, so it's a harness artefact. */}
                  <div
                    data-forum-root
                    data-proxy-url="/dev/posts"
                    data-heading="Community"
                    style={{ ["--ic-accent" as string]: "#1a1a1a" }}
                    suppressHydrationWarning
                  />
                </div>
              ) : (
                <div className="empty">
                  <p>No public posts yet.</p>
                  <p className="muted">
                    Create a category and a post in the admin, or from the
                    storefront, then reload.
                  </p>
                </div>
              )}

              <p className="note">
                Running the real{" "}
                <code>extensions/forum-embed/assets/forum.js</code> from disk,
                in a closed shadow root. Toggle the hostile theme: the
                surrounding box changes, the widget should not.
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="panel__head">
              <span className="panel__title">Forum data</span>
            </div>
            <div className="panel__body">
              {counts ? (
                <>
                  <dl className="stats">
                    <div>
                      <dt>Public posts</dt>
                      <dd>{counts.publicPosts}</dd>
                    </div>
                    <div>
                      <dt>Total posts</dt>
                      <dd>{counts.posts}</dd>
                    </div>
                    <div>
                      <dt>Comments</dt>
                      <dd>{counts.comments}</dd>
                    </div>
                    <div>
                      <dt>Members</dt>
                      <dd>{counts.members}</dd>
                    </div>
                  </dl>
                  <p className="note">
                    Shop <code>{shop}</code>. The gap between total and public
                    is the private category, which must never reach the
                    storefront endpoint.
                  </p>
                </>
              ) : (
                <p className="muted">
                  No shop row yet — install the app on a store first.
                </p>
              )}
            </div>
          </div>

          <div className="panel" style={{ gridColumn: "1 / -1" }}>
            <div className="panel__head">
              <span className="panel__title">Routes</span>
            </div>
            <div className="panel__body">
              <ul className="rows">
                <RouteRow href="/sante" note="Real Prisma query" ok />
                <RouteRow href="/dev/posts" note="Unsigned twin of the proxy fragment" ok />
                <RouteRow href="/" note="Public landing stub" ok />
                <RouteRow
                  href="/app"
                  note="Redirects to OAuth — needs a Partner app"
                  ok={false}
                />
                <RouteRow
                  href="/proxy/posts"
                  note="Rejects unsigned requests, by design"
                  ok={false}
                />
              </ul>
              <p className="note">
                Last two need a free Partner account and{" "}
                <code>shopify app dev</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* inlined rather than copied so this can't drift from what ships */}
      <script dangerouslySetInnerHTML={{ __html: widgetScript }} />
    </>
  )
}

function RouteRow({ href, note, ok }: { href: string; note: string; ok: boolean }) {
  return (
    <li>
      <a href={href}>
        <code>{href}</code>
      </a>
      <span>
        <span className="muted" style={{ marginRight: 10 }}>
          {note}
        </span>
        <span className={ok ? "ok" : "warn"}>{ok ? "works locally" : "needs Shopify"}</span>
      </span>
    </li>
  )
}
