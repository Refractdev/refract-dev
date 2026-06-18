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
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "5px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        pill: "9999px",
        full: "9999px",
      },
      spacing: {
        xxs: "4px",
        xs: "8px",
        sm: "12px",
        md: "16px",
        lg: "24px",
        xl: "28px",
        xxl: "32px",
        base: "16px",
        section: "192px",
      },
      fontSize: {
        // Notion Typography Presets mapped to Vercel/app keys
        "display-xl": ["64px", { lineHeight: "1.0", letterSpacing: "-2.125px", fontWeight: "700" }],
        "display-lg": ["40px", { lineHeight: "1.1", letterSpacing: "-1px", fontWeight: "700" }],
        "display-md": ["26px", { lineHeight: "1.23", letterSpacing: "-0.625px", fontWeight: "700" }],
        "display-sm": ["22px", { lineHeight: "1.27", letterSpacing: "-0.25px", fontWeight: "700" }],
        "body-lg": ["20px", { lineHeight: "1.4", letterSpacing: "-0.125px", fontWeight: "600" }],
        "body-md": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "400" }],
        "body-md-strong": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "600" }],
        "body-sm": ["15px", { lineHeight: "1.33", letterSpacing: "0px", fontWeight: "400" }],
        "body-sm-strong": ["15px", { lineHeight: "1.33", letterSpacing: "0px", fontWeight: "600" }],
        "caption": ["14px", { lineHeight: "1.43", letterSpacing: "0px", fontWeight: "400" }],
        "caption-mono": ["12px", { lineHeight: "1.33", letterSpacing: "0.125px", fontWeight: "600" }],
        "code": ["13px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "400" }],
        "button-md": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "500" }],
        "button-lg": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "500" }],
        
        // Compatibility Aliases for older classes
        "display-mega": ["64px", { lineHeight: "1.0", letterSpacing: "-2.125px", fontWeight: "700" }],
        "title-md": ["20px", { lineHeight: "1.4", letterSpacing: "-0.125px", fontWeight: "600" }],
        "title-sm": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "600" }],
        "caption-uppercase": ["12px", { lineHeight: "1.33", letterSpacing: "0.125px", fontWeight: "600", textTransform: "uppercase" }],
        "button": ["16px", { lineHeight: "1.5", letterSpacing: "0px", fontWeight: "500" }],
        "nav-link": ["15px", { lineHeight: "1.33", letterSpacing: "0px", fontWeight: "400" }],
      },
    },
  },
  plugins: [],
}
