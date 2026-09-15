// storefront widget. runs inside themes we don't control, hence:
// shadow root so their reset can't reach us and we can't bleed into them,
// no globals, no jquery, textContent for anything not already escaped,
// and a visible message on failure — a silent blank section is what merchants
// actually end up reporting.

;(function () {
  "use strict"

  var STYLES = [
    ":host { all: initial; display: block; font-family: inherit; }",
    ".wrap { font: 400 15px/1.5 system-ui, -apple-system, sans-serif; color: #1a1a1a; }",
    ".heading { font-size: 20px; font-weight: 600; margin: 0 0 16px; }",
    ".list { list-style: none; margin: 0; padding: 0; }",
    ".ic-post { padding: 14px 0; border-bottom: 1px solid rgba(0,0,0,.08); }",
    ".ic-post:last-child { border-bottom: 0; }",
    ".ic-post__title { font-size: 16px; font-weight: 600; margin: 0 0 4px; }",
    ".ic-post__link { color: var(--ic-accent, #1a1a1a); text-decoration: none; }",
    ".ic-post__link:hover { text-decoration: underline; }",
    ".ic-post__meta { font-size: 13px; color: rgba(0,0,0,.55); margin: 0; }",
    ".state { font-size: 14px; color: rgba(0,0,0,.55); padding: 12px 0; }",
  ].join("\n")

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

    var wrap = document.createElement("div")
    wrap.className = "wrap"

    var heading = document.createElement("h2")
    heading.className = "heading"
    // textContent not innerHTML, this comes from theme settings
    heading.textContent = root.dataset.heading || "Community"

    var state = document.createElement("p")
    state.className = "state"
    state.textContent = "Loading…"

    wrap.appendChild(heading)
    wrap.appendChild(state)
    shadow.appendChild(style)
    shadow.appendChild(wrap)

    load(root, wrap, state)
  }

  function load(root, wrap, state) {
    var url = root.dataset.proxyUrl
    if (!url) {
      state.textContent = "Forum is not configured."
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
        // only innerHTML in this file: the response is escaped server-side by
        // the html tagged template and it lands in a closed shadow root
        var container = document.createElement("div")
        container.innerHTML = markup
        var list = container.querySelector(".ic-posts")

        state.remove()
        if (!list || !list.children.length) {
          var empty = document.createElement("p")
          empty.className = "state"
          empty.textContent = "No posts yet."
          wrap.appendChild(empty)
          return
        }
        list.classList.add("list")
        wrap.appendChild(list)
      })
      .catch(function () {
        if (timer) clearTimeout(timer)
        state.textContent = "The community could not be loaded. Please refresh."
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
