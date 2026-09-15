// polaris web components for JSX. AppProvider injects the script; these are
// custom elements so react needs telling they exist.
// props kept loose on purpose — full list is at
// https://shopify.dev/docs/api/app-home and pinning unions here just goes stale.

import type React from "react"

type PolarisProps<Extra = Record<string, unknown>> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Extra

type Tone = "info" | "success" | "warning" | "critical" | "neutral" | "auto"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-page": PolarisProps<{ heading?: string }>
      "s-section": PolarisProps<{ heading?: string; padding?: string }>
      "s-box": PolarisProps<{ padding?: string; background?: string; borderRadius?: string }>
      "s-stack": PolarisProps<{
        direction?: "inline" | "block"
        gap?: string
        alignItems?: string
        justifyContent?: string
      }>
      "s-heading": PolarisProps<{ accessibilityRole?: string }>
      "s-text": PolarisProps<{ tone?: Tone; type?: string; fontWeight?: string }>
      "s-paragraph": PolarisProps<{ tone?: Tone }>
      "s-badge": PolarisProps<{ tone?: Tone; icon?: string }>
      "s-button": PolarisProps<{
        variant?: "primary" | "secondary" | "tertiary" | "auto"
        tone?: Tone
        type?: "button" | "submit" | "reset"
        href?: string
        disabled?: boolean
      }>
      "s-link": PolarisProps<{ href?: string; target?: string; tone?: Tone }>
      "s-banner": PolarisProps<{ tone?: Tone; heading?: string }>
      "s-divider": PolarisProps
      "s-table": PolarisProps<{ variant?: string }>
      "s-table-header-row": PolarisProps
      "s-table-header": PolarisProps<{ listSlot?: string }>
      "s-table-body": PolarisProps
      "s-table-row": PolarisProps
      "s-table-cell": PolarisProps
    }
  }
}

export {}
