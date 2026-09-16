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
    ".head { display: flex; align-items: baseline; justify-content: space-between;",
    "        gap: 12px; margin-bottom: 18px; }",
    ".heading { font-size: 22px; font-weight: 650; letter-spacing: -.02em; margin: 0;",
    "           line-height: 1.2; }",
    ".count { font-size: 13px; color: var(--ic-muted); white-space: nowrap; }",

    // --- list ---
    ".list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--ic-faint);",
    "        border-radius: var(--ic-radius); overflow: hidden; background: var(--ic-surface); }",
    ".ic-post + .ic-post { border-top: 1px solid var(--ic-faint); }",

    ".ic-post__link { display: flex; align-items: center; gap: var(--ic-gap);",
    "                 padding: 16px 18px; text-decoration: none; color: inherit;",
    "                 transition: background .14s ease; }",
    ".ic-post__link:hover { background: var(--ic-hover); }",
    ".ic-post__link:focus-visible { outline: 2px solid var(--ic-accent, currentColor);",
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

    // --- post body ---
    ".ic-post__main { min-width: 0; flex: 1 1 auto; display: block; }",
    ".ic-post__title { display: block; font-size: 15.5px; font-weight: 600;",
    "                  letter-spacing: -.01em; line-height: 1.35; margin-bottom: 5px;",
    "                  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".ic-post__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;",
    "                 font-size: 13px; color: var(--ic-muted); }",
    ".ic-post__author, .ic-post__replies { white-space: nowrap; }",
    // a dot separator drawn in css, so the markup carries no decorative text
    ".ic-post__replies::before { content: ''; display: inline-block; width: 3px; height: 3px;",
    "                            border-radius: 50%; background: currentColor; opacity: .5;",
    "                            vertical-align: middle; margin-right: 8px; }",

    ".ic-chip { font-size: 12px; font-weight: 550; padding: 2px 9px; border-radius: 99px;",
    "           background: var(--ic-accent-soft, rgba(22,24,29,.07)); color: var(--ic-fg);",
    "           white-space: nowrap; }",
    ".wrap[data-scheme='dark'] .ic-chip { background: rgba(242,243,245,.10); }",

    ".ic-post__chevron { flex: 0 0 auto; font-size: 22px; line-height: 1; color: var(--ic-muted);",
    "                    opacity: 0; transform: translateX(-4px);",
    "                    transition: opacity .14s ease, transform .14s ease; }",
    ".ic-post__link:hover .ic-post__chevron { opacity: .7; transform: none; }",

    // --- states ---
    ".state { border: 1px solid var(--ic-faint); border-radius: var(--ic-radius);",
    "         padding: 40px 20px; text-align: center; color: var(--ic-muted); font-size: 14px; }",
    ".state strong { display: block; color: var(--ic-fg); font-size: 15px; font-weight: 600;",
    "                margin-bottom: 4px; }",

    // skeleton rows, so the first paint has the shape of the answer
    ".skeleton { list-style: none; margin: 0; padding: 0; border: 1px solid var(--ic-faint);",
    "            border-radius: var(--ic-radius); overflow: hidden; }",
    ".skeleton li { display: flex; align-items: center; gap: var(--ic-gap); padding: 16px 18px; }",
    ".skeleton li + li { border-top: 1px solid var(--ic-faint); }",
    ".sk { background: var(--ic-faint); border-radius: 6px; animation: ic-pulse 1.4s ease-in-out infinite; }",
    ".sk--avatar { width: 40px; height: 40px; border-radius: 50%; flex: 0 0 auto; }",
    ".sk--lines { flex: 1 1 auto; }",
    ".sk--title { height: 11px; width: 58%; margin-bottom: 8px; }",
    ".sk--meta { height: 9px; width: 34%; }",
    "@keyframes ic-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }",
    "@media (prefers-reduced-motion: reduce) { .sk { animation: none } }",

    // --- narrow screens ---
    "@media (max-width: 480px) {",
    "  .ic-post__link { padding: 14px; gap: 12px; }",
    "  .ic-avatar { width: 34px; height: 34px; font-size: 12px; }",
    "  .ic-post__title { white-space: normal; }",
    "  .ic-post__chevron { display: none; }",
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
    for (var i = 0; i < 3; i++) {
      var li = document.createElement("li")
      li.appendChild(el("div", "sk sk--avatar"))
      var lines = el("div", "sk--lines")
      lines.appendChild(el("div", "sk sk--title"))
      lines.appendChild(el("div", "sk sk--meta"))
      li.appendChild(lines)
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
