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
    ".ic-card__foot { display: flex; align-items: center; gap: 10px;",
    "                 padding: 6px 10px 6px 6px; font-size: 13px; color: var(--ic-muted); }",
    ".ic-card__media + .ic-card__foot { border-top: 1px solid var(--ic-faint); }",
    ".ic-card__replies { margin-left: auto; color: inherit; text-decoration: none; }",
    ".ic-card__replies:hover { text-decoration: underline; }",
    // a speech bubble drawn in css, so the markup carries no decorative text
    ".ic-card__replies::before { content: ''; display: inline-block;",
    "                            width: 13px; height: 11px; margin-right: 7px;",
    "                            vertical-align: -1px; border: 1.5px solid currentColor;",
    "                            border-radius: 4px 4px 4px 0; opacity: .7; }",

    // --- the heart ---
    // the one deliberately un-themed colour in the widget. a filled and an
    // unfilled heart have to be distinguishable at a glance, and "the theme's
    // text colour, but heavier" is not a state change anyone can see.
    ".ic-like { margin: 0; display: inline-flex; }",
    ".ic-like__btn { display: inline-flex; align-items: center; justify-content: center;",
    "                width: 34px; height: 34px; padding: 0; border: 0; border-radius: 50%;",
    "                background: transparent; color: inherit; cursor: pointer;",
    "                text-decoration: none; -webkit-tap-highlight-color: transparent; }",
    ".ic-like__btn:hover { background: var(--ic-hover); }",
    ".ic-like__btn:focus-visible { outline: 2px solid var(--ic-accent, currentColor);",
    "                              outline-offset: 2px; }",
    ".ic-heart { width: 21px; height: 21px; display: block;",
    "            transition: transform .18s ease, fill .18s ease, stroke .18s ease; }",
    ".ic-like__btn[aria-pressed='true'] .ic-heart { fill: #ed4956; stroke: #ed4956; }",
    ".ic-like__count { font-weight: 600; color: var(--ic-fg); }",
    // no likes yet means no label at all, rather than a lonely "0 likes"
    ".ic-like__count:empty { display: none; }",
    // added by script on toggle, removed when the animation ends
    ".ic-like__btn[data-pop] .ic-heart { animation: ic-pop .3s ease; }",
    "@keyframes ic-pop { 0% { transform: scale(1) } 35% { transform: scale(1.28) }",
    "                    65% { transform: scale(.92) } 100% { transform: scale(1) } }",
    "@media (prefers-reduced-motion: reduce) {",
    "  .ic-heart { transition: none; }",
    "  .ic-like__btn[data-pop] .ic-heart { animation: none; }",
    "}",

    // --- comment preview ---
    ".ic-card__preview { padding: 0 16px 14px; display: grid; gap: 4px; }",
    ".ic-card__viewall { font-size: 13.5px; color: var(--ic-muted); text-decoration: none;",
    "                    justify-self: start; }",
    ".ic-card__viewall:hover { text-decoration: underline; }",
    ".ic-card__comment { margin: 0; font-size: 14px; line-height: 1.45;",
    // one line each: the preview is a taste of the thread, and a card that
    // grows with a rambling comment pushes the next post off the screen
    "                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".ic-card__comment-who { font-weight: 600; margin-right: 5px; }",

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
    "  .ic-card__foot { padding: 5px 12px 5px 5px; }",
    "  .ic-card__preview { padding: 0 14px 12px; }",
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

  // --- likes ----------------------------------------------------------------

  // Must match likeLabel() in app/lib/render-posts.ts. The server renders the
  // first label and this renders every one after it, so if the two disagree
  // the text changes the moment anyone taps. Kept as two small functions
  // rather than shipping the wording in a data attribute, which would put it
  // in the markup three times instead of two.
  function likeLabel(count) {
    if (count <= 0) return ""
    return count === 1 ? "1 like" : count + " likes"
  }

  function countFrom(label) {
    var n = parseInt(label, 10)
    return isNaN(n) ? 0 : n
  }

  function setLike(button, label, liked, count) {
    button.setAttribute("aria-pressed", liked ? "true" : "false")
    if (label) label.textContent = likeLabel(count)
  }

  function pop(button) {
    button.removeAttribute("data-pop")
    // read back a layout property so the browser starts a new animation
    // instead of continuing the one that is already running
    void button.offsetWidth
    button.setAttribute("data-pop", "")
    var clear = function () {
      button.removeAttribute("data-pop")
    }
    button.addEventListener("animationend", clear, { once: true })
    // animationend never fires under prefers-reduced-motion, where the rule is
    // animation: none — without this the attribute would stay forever
    setTimeout(clear, 400)
  }

  function submitLike(form) {
    var button = form.querySelector(".ic-like__btn")
    if (!button) return
    // a tap while the last one is still in flight is dropped rather than
    // queued: two toggles racing would land in whichever order the network
    // decided, and the heart would settle on a state nobody asked for
    if (form.dataset.busy === "1") return

    var foot = form.parentNode
    var label = foot ? foot.querySelector("[data-like-count]") : null

    var wasPressed = button.getAttribute("aria-pressed") === "true"
    var wasLabel = label ? label.textContent : ""

    // optimistic: the heart fills on the tap, not on the round trip. a like
    // that waits for the network feels broken on a phone.
    setLike(button, label, !wasPressed, countFrom(wasLabel) + (wasPressed ? -1 : 1))
    pop(button)

    form.dataset.busy = "1"
    fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) {
          // read the body before throwing: a 404 from a route that was never
          // registered and a 401 from a signed-out shopper look identical
          // from the status alone once this has rolled back
          return response.text().then(function (text) {
            throw new Error("HTTP " + response.status + " " + text.slice(0, 200))
          })
        }
        return response.json()
      })
      .then(function (data) {
        // the server's count wins: someone else may have liked the post
        // between the page rendering and this tap
        setLike(button, label, !!data.liked, data.count)
      })
      .catch(function (error) {
        // put it back exactly as it was. a heart left looking filled when the
        // like never saved is worse than one that visibly refuses.
        button.setAttribute("aria-pressed", wasPressed ? "true" : "false")
        if (label) label.textContent = wasLabel
        // and say why. a heart that silently flips back is indistinguishable
        // from a bug in the animation, which is exactly how this was first
        // reported.
        if (window.console && console.error) {
          console.error("[forum] like failed:", form.action, String(error))
        }
      })
      .then(function () {
        form.dataset.busy = ""
      })
  }

  // one delegated listener, bound once to the container that survives every
  // re-render. per-button listeners would have to be re-attached each time the
  // feed is replaced, and the ones on the old nodes would leak.
  function bindLikes(body) {
    body.addEventListener("submit", function (event) {
      var form = event.target
      if (!form || !form.matches || !form.matches("[data-like-form]")) return
      event.preventDefault()
      submitLike(form)
    })
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
    bindLikes(body)

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
