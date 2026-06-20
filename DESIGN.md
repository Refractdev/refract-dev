# Refract Design System

> Flat, dark-first, information-dense. Inspired by Supabase and Cursor. Built on Refract's blue accent.

---

## Philosophy

- **Flat over layered** — no elevation shadows, only border hairlines for depth
- **Dark-first** — dark mode is the canonical view; light mode is a high-contrast inversion
- **Information density** — compact spacing, small type, no wasted chrome
- **System-native** — Geist type, crisp icons, no decorative gradients on UI chrome
- **Consistent motion** — 150ms ease transitions only; no bounce, no spring

---

## Color Tokens

### Dark Mode (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--canvas` | `#0c0c0c` | Deepest background (body, sidebar) |
| `--canvas-soft` | `#111111` | Page background |
| `--canvas-soft-2` | `#171717` | Hover states, active nav |
| `--surface-card` | `#111111` | Card backgrounds |
| `--surface-strong` | `#1c1c1c` | Elevated panels, dropdowns |
| `--hairline` | `#262626` | Default borders |
| `--hairline-soft` | `#1e1e1e` | Subtle dividers |
| `--hairline-strong` | `#333333` | Emphasized borders, active rings |
| `--ink` | `#ededed` | Primary text |
| `--ink-muted` | `#a1a1a1` | Secondary text, labels |
| `--ink-muted-soft` | `#666666` | Tertiary text, placeholders |
| `--body` | `#b5b5b5` | Body paragraphs |
| `--body-strong` | `#ffffff` | Maximum contrast text |

### Light Mode

| Token | Value | Usage |
|-------|-------|-------|
| `--canvas` | `#ffffff` | Body background |
| `--canvas-soft` | `#fafafa` | Page background |
| `--canvas-soft-2` | `#f4f4f5` | Hover states |
| `--surface-card` | `#ffffff` | Cards |
| `--surface-strong` | `#f0f0f2` | Elevated panels |
| `--hairline` | `#e4e4e7` | Default borders |
| `--hairline-soft` | `#ebebed` | Subtle dividers |
| `--hairline-strong` | `#d1d1d6` | Emphasized borders |
| `--ink` | `rgba(0,0,0,0.92)` | Primary text |
| `--ink-muted` | `#6b6b80` | Secondary text |
| `--ink-muted-soft` | `#a0a0b0` | Tertiary text |

### Brand & Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#0075de` | CTAs, links, active states |
| `--primary-active` | `#005bab` | Pressed state |
| `--on-primary` | `#ffffff` | Text on primary bg |
| `--semantic-success` | `#22c55e` | Success states |
| `--semantic-error` | `#ef4444` | Error states |
| `--semantic-warning` | `#f59e0b` | Warning states |

---

## Typography

**Font stack:**
- `--font-sans`: `"Geist", system-ui, -apple-system, sans-serif`
- `--font-mono`: `"Geist Mono", ui-monospace, monospace`

**Scale:**

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|-------|------|--------|-------------|----------------|-----|
| `display-xl` | 56px | 700 | 1.0 | -1.5px | Marketing hero |
| `display-lg` | 36px | 700 | 1.1 | -0.75px | Page hero |
| `display-md` | 24px | 600 | 1.2 | -0.4px | Section title |
| `display-sm` | 20px | 600 | 1.25 | -0.2px | Card title |
| `body-lg` | 16px | 400 | 1.5 | 0 | Body copy |
| `body-md` | 14px | 400 | 1.5 | 0 | Default body |
| `body-sm` | 13px | 400 | 1.4 | 0 | Secondary body |
| `caption` | 12px | 400 | 1.4 | 0 | Captions, meta |
| `caption-mono` | 11px | 500 | 1.3 | 0.5px | Labels, badges |
| `code` | 13px | 400 | 1.6 | 0 | Code blocks |

**Nav text:** 13px, weight 400/500, tight tracking. Active state: weight 500.

---

## Spacing

```
4px   xxs   micro gap, icon spacing
8px   xs    tight internal padding
12px  sm    compact padding
16px  md    standard padding (base unit)
24px  lg    card padding, section gap
32px  xl    section separation
48px  xxl   large layout gaps
```

---

## Border Radius

```
--radius:    6px    default (inputs, buttons, nav items)
4px          xs     tight chips, badges
8px          md     cards, panels
12px         lg     modals, large cards
9999px       pill   pill buttons, tags
```

---

## Shadows

Flat design — shadows are used **only for floating elements** (dropdowns, tooltips, modals).

```css
/* Dropdown / popover */
--shadow-dropdown: 0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.04);

/* Modal */
--shadow-modal: 0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
```

No shadows on cards, sidebars, or nav elements — borders only.

---

## Layout Shell

```
┌──────────────────────────────────────────────────────┐
│  Topbar (48px)                                       │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Main Content                             │
│ 220px    │  (flex: 1)                                │
│ (52px    │                                           │
│  collapsed)                                          │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

### Topbar (48px)

```
[ Logo · Page Title ]  ·····  [ ⌘K Search ]  [ ☀/☾ ]  [ Avatar ▾ ]
```

- `border-bottom: 1px solid var(--hairline)`
- Background: `var(--canvas)`, `position: sticky`, `top: 0`, `z-index: 40`
- Left: Logo mark (18px) + current page name (14px, weight 500)
- Right: Search button (⌘K), theme toggle, user avatar with dropdown

### Sidebar

**Expanded (220px):**
- Header: Logo + "Refract" wordmark + Beta badge + collapse toggle
- Nav section label: 10px monospace uppercase, muted
- Nav items: 13px, 32px height, 6px radius, 8px horizontal padding
- Active: `background: var(--canvas-soft-2)`, left accent bar `2px` primary color
- Footer: GitHub status, feedback link, user card

**Collapsed (52px):**
- Header: Logo mark only + expand toggle
- Nav items: 32px × 32px, centered icon, tooltip on hover
- Footer: avatar icon only

**Collapse toggle:** `ChevronLeft` / `ChevronRight` icon, 20px × 20px, bottom-left corner.

### Nav Items

```tsx
// Active state
bg: var(--canvas-soft-2)
text: var(--ink)
font-weight: 500
border-left: 2px solid var(--primary)

// Default
bg: transparent
text: var(--ink-muted)
hover-bg: var(--canvas-soft-2)
hover-text: var(--ink)
```

---

## Icon Registry

All icons from `lucide-react` at `16px` stroke-width `1.5`.

| Context | Icon | Lucide Name |
|---------|------|-------------|
| Dashboard | Home | `Home` |
| Projects | Layers | `Layers` |
| Repositories | Git Fork | `GitFork` |
| Guidelines | Open Book | `BookOpen` |
| Settings | Sliders | `Settings2` |
| Feedback | Message | `MessageSquare` |
| Sign Out | Log Out | `LogOut` |
| Collapse | Chevron Left | `ChevronLeft` |
| Expand | Chevron Right | `ChevronRight` |
| Search | Search | `Search` |
| Theme Light | Sun | `Sun` |
| Theme Dark | Moon | `Moon` |
| New / Add | Plus | `Plus` |
| GitHub | GitHub | inline SVG |
| Status OK | Circle filled | `CircleDot` |
| Error | Alert | `AlertCircle` |
| Loading | Loader | `Loader2` |

---

## Components

### Button

```
Primary    bg: --primary,      text: --on-primary,  radius: 6px,   h: 32px, px: 14px
Secondary  bg: transparent,    border: --hairline,   radius: 6px,   h: 32px, px: 14px
Ghost      bg: transparent,    text: --ink-muted,    radius: 6px,   h: 32px, px: 10px
Danger     bg: --semantic-error/10, text: --semantic-error, h: 32px
```

No pill/full-radius on internal buttons. Pill only on marketing CTAs.

### Card

```css
background: var(--surface-card);
border: 1px solid var(--hairline);
border-radius: 8px;
padding: 20px;
/* No box-shadow */
```

Hover: `border-color: var(--hairline-strong)` only.

### Badge

```
Default     bg: --surface-strong,   text: --ink-muted,    border: --hairline
Success     bg: --success/12,       text: --success
Error       bg: --error/12,         text: --error
Warning     bg: --warning/12,       text: --warning
```

Height: 20px, padding: 2px 8px, radius: 4px, font: 11px monospace.

### Input

```css
background: var(--canvas-soft-2);
border: 1px solid var(--hairline);
border-radius: 6px;
height: 32px;
padding: 0 10px;
font-size: 13px;
```

Focus: `border-color: var(--primary)`, `box-shadow: 0 0 0 3px rgba(0,117,222,0.15)`.

### Divider

```css
height: 1px;
background: var(--hairline);
/* No margin by default — apply via spacing utilities */
```

---

## Motion

```css
/* Default transition (all interactive elements) */
transition: color 120ms ease, background-color 120ms ease,
            border-color 120ms ease, opacity 120ms ease;

/* Sidebar collapse */
transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);

/* Modal enter */
@keyframes modalIn {
  from { opacity: 0; transform: scale(0.97) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0);   }
}
```

---

## Dark Mode Notes

- Apply via `[data-theme="dark"]` on `<html>` (existing pattern)
- All color tokens are CSS variables — no Tailwind `dark:` variants needed
- Background layers: `--canvas` (sidebar) → `--canvas-soft` (page body) → `--surface-card` (cards)
- In dark mode: sidebar bg = `--canvas` (#0c0c0c) is **darker** than body (`--canvas-soft` #111111)
- Scrollbars: 4px wide, `--hairline` thumb, transparent track

---

## Scrollbar

```css
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--hairline-strong); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--ink-muted-soft); }
```

---

## Accessibility

- All interactive elements have `:focus-visible` ring: `0 0 0 2px var(--primary)`
- Minimum tap target: 32px × 32px
- Color contrast: AA minimum for all text on backgrounds
- Icons supplemented with `aria-label` or adjacent text
- Sidebar collapsed state: tooltips for all nav items

---

## Do's and Don'ts

**Do:**
- Use `var(--hairline)` borders for all surface separation
- Use weight 500 for active/selected states only
- Use monospace font for numbers, counts, hashes, file paths
- Keep icon size at 16px for nav; 14px for inline

**Don't:**
- Add drop shadows to cards or sidebar
- Use border-radius > 8px on UI chrome (only on modals/popovers)
- Use gradient fills on interactive elements
- Use more than 2 font weights in a single component
- Add animations to list items or cards on hover (border-color change only)
