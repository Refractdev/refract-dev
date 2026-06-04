/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Vercel brand colors mapped dynamically to CSS variables
        primary: "var(--primary)",
        "primary-active": "var(--primary-active)",
        "on-primary": "var(--on-primary)",

        // Vercel surface
        canvas: "var(--canvas)",
        "canvas-soft": "var(--canvas-soft)",
        "canvas-soft-2": "var(--canvas-soft-2)",
        "surface-card": "var(--surface-card)",
        "surface-strong": "var(--surface-strong)",

        // Vercel ink/text
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-muted-soft": "var(--ink-muted-soft)",
        "body": "var(--body)",
        "body-strong": "var(--body-strong)",

        // Vercel hairlines
        hairline: "var(--hairline)",
        "hairline-soft": "var(--hairline-soft)",
        "hairline-strong": "var(--hairline-strong)",

        // Vercel timeline (AI-action signature)
        "timeline-thinking": "var(--timeline-thinking)",
        "timeline-grep": "var(--timeline-grep)",
        "timeline-read": "var(--timeline-read)",
        "timeline-edit": "var(--timeline-edit)",
        "timeline-done": "var(--timeline-done)",

        // Vercel semantic
        "semantic-success": "var(--semantic-success)",
        "semantic-error": "var(--semantic-error)",

        // Tailwind defaults mapped to Vercel
        background: "var(--canvas-soft)",
        foreground: "var(--ink)",
        card: "var(--surface-card)",
        "card-foreground": "var(--ink)",
        popover: "var(--surface-card)",
        "popover-foreground": "var(--ink)",
        muted: "var(--surface-strong)",
        "muted-foreground": "var(--ink-muted)",
        accent: "var(--canvas-soft-2)",
        "accent-foreground": "var(--ink)",
        border: "var(--hairline)",
        input: "var(--surface-card)",
        ring: "var(--primary)",
      },
      fontFamily: {
        sans: ["Geist", "Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'Geist Mono'", "'JetBrains Mono'", "'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "100px",
        full: "9999px",
      },
      spacing: {
        xxs: "4px",
        xs: "8px",
        sm: "12px",
        base: "16px",
        md: "16px", // aligned to Vercel base 4 system
        lg: "24px",
        xl: "32px",
        xxl: "48px",
        section: "192px",
      },
      fontSize: {
        // Vercel Typography Presets
        "display-xl": ["48px", { lineHeight: "48px", letterSpacing: "-2.4px", fontWeight: "600" }],
        "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-1.28px", fontWeight: "600" }],
        "display-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.96px", fontWeight: "600" }],
        "display-sm": ["20px", { lineHeight: "28px", letterSpacing: "-0.6px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", letterSpacing: "0px", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "24px", letterSpacing: "0px", fontWeight: "400" }],
        "body-md-strong": ["16px", { lineHeight: "24px", letterSpacing: "0px", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "20px", letterSpacing: "-0.28px", fontWeight: "400" }],
        "body-sm-strong": ["14px", { lineHeight: "20px", letterSpacing: "-0.28px", fontWeight: "500" }],
        "caption": ["12px", { lineHeight: "16px", letterSpacing: "0px", fontWeight: "400" }],
        "caption-mono": ["12px", { lineHeight: "16px", letterSpacing: "0px", fontWeight: "400" }],
        "code": ["13px", { lineHeight: "20px", letterSpacing: "0px", fontWeight: "400" }],
        "button-md": ["14px", { lineHeight: "20px", letterSpacing: "0px", fontWeight: "500" }],
        "button-lg": ["16px", { lineHeight: "24px", letterSpacing: "0px", fontWeight: "500" }],
        
        // Compatibility Aliases for older classes
        "display-mega": ["72px", { lineHeight: "1.1", letterSpacing: "-2.16px", fontWeight: "600" }],
        "title-md": ["18px", { lineHeight: "24px", letterSpacing: "0px", fontWeight: "600" }],
        "title-sm": ["16px", { lineHeight: "20px", letterSpacing: "0px", fontWeight: "600" }],
        "caption-uppercase": ["11px", { lineHeight: "16px", letterSpacing: "0.88px", fontWeight: "600", textTransform: "uppercase" }],
        "button": ["14px", { lineHeight: "20px", letterSpacing: "0px", fontWeight: "500" }],
        "nav-link": ["14px", { lineHeight: "20px", letterSpacing: "-0.28px", fontWeight: "400" }],
      },
    },
  },
  plugins: [],
}
