// storefront widget. runs inside themes we don't control, hence:
// shadow root so their reset can't reach us and we can't bleed into them,
// no globals, no jquery, textContent for anything not already escaped,
// and a visible message on failure — a silent blank section is what merchants
// actually end up reporting.

;(function () {
  "use strict"

  // everything scales off one type ramp and one spacing unit. tints are
  // rgba over the surface rather than fixed hexes, so the light and dark
  // schemes share a single set of rules.
  var STYLES = [
    ":host { all: initial; display: block; }",
    "*, *::before, *::after { box-sizing: border-box; }",

    ".wrap {",
    // themes do not all wrap an app section in their page container, and
    // without this the forum runs edge to edge with the heading touching the
    // viewport. safe either way: a theme that does centre its sections just
    // gets a slightly narrower column.
    "  max-width: var(--ic-max-width, 1100px);",
    "  margin-inline: auto;",
    "  padding-inline: clamp(16px, 4vw, 32px);",
    "  --ic-radius: 14px;",
    "  --ic-gap: 14px;",
    "  --ic-fg: #16181d;",
    "  --ic-muted: rgba(22,24,29,.58);",
    "  --ic-faint: rgba(22,24,29,.10);",
    "  --ic-hover: rgba(22,24,29,.035);",
    "  --ic-surface: #fff;",
    "  font: 400 15px/1.5 var(--ic-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, sans-serif);",
    "  color: var(--ic-fg);",
    "  -webkit-font-smoothing: antialiased;",
    "}",

    // dark stores are common and a white card on one looks broken
    ".wrap[data-scheme='dark'] {",
    "  --ic-fg: #f2f3f5;",
    "  --ic-muted: rgba(242,243,245,.58);",
    "  --ic-faint: rgba(242,243,245,.14);",
    "  --ic-hover: rgba(242,243,245,.06);",
    "  --ic-surface: transparent;",
    "}",

    // --- header ---
    // the heading lines up with the cards rather than with the theme's full
    // content width, otherwise a 620px feed hangs under a 1100px title
    ".head { display: flex; align-items: baseline; justify-content: space-between;",
    "        gap: 12px; margin: 0 auto 18px; max-width: var(--ic-feed-width, 620px); }",
    ".heading { font-size: 22px; font-weight: 650; letter-spacing: -.02em; margin: 0;",
    "           line-height: 1.2; }",
    ".count { font-size: 13px; color: var(--ic-muted); white-space: nowrap; }",

    // --- feed ---
    // a stack of cards rather than one bordered list: a post with a photo is
    // the unit people scroll, so each one gets its own edge and its own
    // whitespace instead of sharing a hairline with its neighbours.
    ".list { list-style: none; margin: 0 auto; padding: 0; display: grid;",
    "        gap: 16px; max-width: var(--ic-feed-width, 620px); }",
    ".ic-card { border: 1px solid var(--ic-faint); border-radius: var(--ic-radius);",
    "           overflow: hidden; background: var(--ic-surface); }",

    ".ic-card__link { display: block; text-decoration: none; color: inherit;",
    "                 transition: background .14s ease; }",
    ".ic-card__link:hover { background: var(--ic-hover); }",
    ".ic-card__link:focus-visible { outline: 2px solid var(--ic-accent, currentColor);",
    "                               outline-offset: -2px; }",

    // --- avatar ---
    ".ic-avatar { flex: 0 0 auto; width: 40px; height: 40px; border-radius: 50%;",
    "             display: grid; place-items: center; font-size: 13px; font-weight: 650;",
    "             letter-spacing: .02em; user-select: none; }",
    // six soft tints. saturation kept low so they read as neutral UI, not confetti.
    ".ic-avatar[data-tint='0'] { background: rgba(88,124,212,.14); color: #3f5ea8; }",
    ".ic-avatar[data-tint='1'] { background: rgba(58,160,120,.14); color: #2b7a58; }",
    ".ic-avatar[data-tint='2'] { background: rgba(206,130,52,.15); color: #97590f; }",
    ".ic-avatar[data-tint='3'] { background: rgba(170,96,196,.14); color: #7c4292; }",
    ".ic-avatar[data-tint='4'] { background: rgba(198,86,96,.14); color: #9c3b45; }",
    ".ic-avatar[data-tint='5'] { background: rgba(70,150,168,.15); color: #2f6f7e; }",
    ".wrap[data-scheme='dark'] .ic-avatar { color: #fff; }",

    // --- card head: who posted, and where ---
    ".ic-card__head { display: flex; align-items: center; gap: 10px;",
    "                 padding: 14px 16px 10px; }",
    ".ic-card__who { min-width: 0; display: block; }",
    ".ic-card__author { display: block; font-size: 14px; font-weight: 600;",
    "                   line-height: 1.3; overflow: hidden; text-overflow: ellipsis;",
    "                   white-space: nowrap; }",
    ".ic-card__where { display: block; margin-top: 3px; }",

    ".ic-chip { display: inline-block; font-size: 12px; font-weight: 550;",
    "           padding: 1px 8px; border-radius: 99px;",
    "           background: var(--ic-accent-soft, rgba(22,24,29,.07)); color: var(--ic-muted);",
    "           white-space: nowrap; }",
    ".wrap[data-scheme='dark'] .ic-chip { background: rgba(242,243,245,.10); }",

    // --- card body ---
    ".ic-card__title { font-size: 17px; font-weight: 650; letter-spacing: -.015em;",
    "                  line-height: 1.3; margin: 0; padding: 0 16px 8px; }",
    // the gap under the excerpt is margin, not padding: overflow clips at the
    // padding edge, so bottom padding here would show a sliver of the line
    // the clamp is supposed to be hiding
    ".ic-card__excerpt { margin: 0 0 14px; padding: 0 16px; font-size: 14.5px;",
    "                    line-height: 1.55; color: var(--ic-muted);",
    // two lines of preview: enough to be worth reading, short enough that ten
    // cards still fit on a screen's worth of scrolling
    "                    display: -webkit-box; -webkit-line-clamp: 2;",
    "                    -webkit-box-orient: vertical; overflow: hidden; }",

    // the photo goes edge to edge, the way a feed post does. the element is
    // also sized inline in the markup, so a card rendered before this
    // stylesheet lands is still a card and not a wall.
    ".ic-card__media { display: block; background: var(--ic-faint); }",
    ".ic-card__photo { display: block; width: 100%; aspect-ratio: 4 / 3;",
    "                  max-height: 420px; object-fit: cover;",
    "                  transition: opacity .14s ease; }",
    ".ic-card__link:hover .ic-card__photo { opacity: .94; }",

    // --- card foot ---
    ".ic-card__foot { display: flex; align-items: center; gap: 14px;",
    "                 padding: 11px 16px; font-size: 13px; color: var(--ic-muted); }",
    ".ic-card__media + .ic-card__foot { border-top: 1px solid var(--ic-faint); }",
    // a speech bubble drawn in css, so the markup carries no decorative text
    ".ic-card__replies::before { content: ''; display: inline-block;",
    "                            width: 13px; height: 11px; margin-right: 7px;",
    "                            vertical-align: -1px; border: 1.5px solid currentColor;",
    "                            border-radius: 4px 4px 4px 0; opacity: .7; }",

    // --- states ---
    ".state { border: 1px solid var(--ic-faint); border-radius: var(--ic-radius);",
    "         padding: 40px 20px; text-align: center; color: var(--ic-muted); font-size: 14px; }",
    ".state strong { display: block; color: var(--ic-fg); font-size: 15px; font-weight: 600;",
    "                margin-bottom: 4px; }",

    // skeleton cards, so the first paint has the shape of the answer
    ".skeleton { list-style: none; margin: 0 auto; padding: 0; display: grid; gap: 16px;",
    "            max-width: var(--ic-feed-width, 620px); }",
    ".skeleton li { border: 1px solid var(--ic-faint); border-radius: var(--ic-radius);",
    "               overflow: hidden; }",
    ".sk-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }",
    ".sk { background: var(--ic-faint); border-radius: 6px; animation: ic-pulse 1.4s ease-in-out infinite; }",
    ".sk--avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto; }",
    ".sk--lines { flex: 1 1 auto; }",
    ".sk--title { height: 11px; width: 42%; margin-bottom: 8px; }",
    ".sk--meta { height: 9px; width: 26%; }",
    // the photo block is most of a card's height, so leaving it out would make
    // the skeleton jump when the real cards land
    ".sk--photo { border-radius: 0; aspect-ratio: 4 / 3; max-height: 420px; }",
    "@keyframes ic-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }",
    "@media (prefers-reduced-motion: reduce) { .sk { animation: none } }",

    // --- narrow screens ---
    "@media (max-width: 480px) {",
    "  .ic-card__head { padding: 12px 14px 8px; }",
    "  .ic-avatar { width: 34px; height: 34px; font-size: 12px; }",
    "  .ic-card__title { font-size: 16px; padding: 0 14px 7px; }",
    "  .ic-card__excerpt { margin-bottom: 12px; padding: 0 14px; }",
    "  .ic-card__foot { padding: 10px 14px; }",
    "}",
  ].join("\n")

  function el(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
  }

  function skeleton() {
    var ul = el("ul", "skeleton")
    for (var i = 0; i < 2; i++) {
      var li = document.createElement("li")
      var head = el("div", "sk-head")
      head.appendChild(el("div", "sk sk--avatar"))
      var lines = el("div", "sk--lines")
      lines.appendChild(el("div", "sk sk--title"))
      lines.appendChild(el("div", "sk sk--meta"))
      head.appendChild(lines)
      li.appendChild(head)
      li.appendChild(el("div", "sk sk--photo"))
      ul.appendChild(li)
    }
    return ul
  }

  function state(title, detail) {
    var box = el("div", "state")
    box.appendChild(el("strong", null, title))
    if (detail) box.appendChild(document.createTextNode(detail))
    return box
  }

  function mount(root) {
    if (root.dataset.forumMounted === "1") return
    root.dataset.forumMounted = "1"

    // closed so a theme script can't reach in and rewrite it
    var shadow = root.attachShadow ? root.attachShadow({ mode: "closed" }) : null
    if (!shadow) {
      // degrade to text rather than dumping unstyled markup into their page
      root.textContent = "Open the community forum"
      return
    }

    var style = document.createElement("style")
    style.textContent = STYLES

    var wrap = el("div", "wrap")
    wrap.dataset.scheme = root.dataset.scheme === "dark" ? "dark" : "light"

    var head = el("div", "head")
    // textContent not innerHTML, this comes from theme settings
    head.appendChild(el("h2", "heading", root.dataset.heading || "Community"))
    var count = el("span", "count", "")
    head.appendChild(count)

    var body = document.createElement("div")
    body.appendChild(skeleton())

    wrap.appendChild(head)
    wrap.appendChild(body)
    shadow.appendChild(style)
    shadow.appendChild(wrap)

    load(root, body, count)
  }

  function load(root, body, count) {
    var url = root.dataset.proxyUrl
    if (!url) {
      body.replaceChildren(state("Forum is not configured"))
      return
    }
    if (root.dataset.category) {
      url += "?category=" + encodeURIComponent(root.dataset.category)
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null
    var timer = controller
      ? setTimeout(function () {
          controller.abort()
        }, 8000)
      : null

    fetch(url, {
      credentials: "same-origin",
      headers: { accept: "text/html" },
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (timer) clearTimeout(timer)
        if (!response.ok) throw new Error("HTTP " + response.status)
        return response.text()
      })
      .then(function (markup) {
        // the only innerHTML in this file: the response is escaped server-side
        // by the html tagged template and it lands in a closed shadow root
        var container = document.createElement("div")
        container.innerHTML = markup
        var list = container.querySelector(".ic-posts")

        if (!list || !list.children.length) {
          body.replaceChildren(
            state("No posts yet", "Be the first to start a conversation."),
          )
          return
        }

        list.classList.add("list")
        body.replaceChildren(list)

        var n = list.children.length
        count.textContent = n === 1 ? "1 discussion" : n + " discussions"
      })
      .catch(function () {
        if (timer) clearTimeout(timer)
        body.replaceChildren(
          state("Couldn't load the community", "Please refresh the page to try again."),
        )
      })
  }

  function init() {
    var roots = document.querySelectorAll("[data-forum-root]")
    for (var i = 0; i < roots.length; i++) mount(roots[i])
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }

  // theme editor re-renders sections without a page load
  document.addEventListener("shopify:section:load", init)
})()
