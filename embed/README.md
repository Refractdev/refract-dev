# Refract UI Embeds

Self-contained React UI components extracted from the Refract app, with static demo data. Copy this folder to your site or build the iframe bundle for embedding.

## What's included

| Component | File | Description |
|-----------|------|-------------|
| **Diff View** | `components/DiffViewEmbed.tsx` | Side-by-side or unified diff |
| **Issues View** | `components/IssuesReviewEmbed.tsx` | 3-column issue review (Fix Queue + diff + actions) |
| **Project View** | `components/ProjectViewEmbed.tsx` | Top bar + issues layout |
| **Quality Dashboard** | `components/QualityDashboardEmbed.tsx` | Health score, charts, alerts, commits |

## Dependencies

```json
{
  "react": "^18",
  "react-dom": "^18",
  "lucide-react": "^0.469",
  "recharts": "^2.15"
}
```

No Supabase, Tailwind, or app auth required.

## Option A — Copy components into your React site

1. Copy the entire `embed/` folder into your project.
2. Install dependencies: `npm install react react-dom lucide-react recharts`
3. Import tokens once in your app entry:

```tsx
import './embed/tokens.css'
```

4. Use any component:

```tsx
import { IssuesReviewEmbed } from './embed/components/IssuesReviewEmbed'
import { QualityDashboardEmbed } from './embed/components/QualityDashboardEmbed'

export function Demo() {
  return (
    <div>
      <IssuesReviewEmbed />
      <QualityDashboardEmbed height={860} />
    </div>
  )
}
```

### Custom demo data

All components accept optional props. Issues use `DemoIssue[]` from `mock/demoData.ts`:

```tsx
import { DiffViewEmbed } from './embed/components/DiffViewEmbed'
import { DEMO_ISSUES } from './embed/mock/demoData'

<DiffViewEmbed variant="unified" issue={DEMO_ISSUES[0]} />
```

## Option B — Static iframe build

1. Install and build:

```bash
cd embed
npm install
npm run build
```

Output goes to `embed/dist/`. Deploy that folder to any static host (Vercel, S3, Netlify, etc.).

2. Embed on your site:

```html
<!-- Issues review -->
<iframe
  src="https://cdn.yoursite.com/refract-embed/#issues?embed=1"
  width="100%"
  height="640"
  style="border:1px solid #e6e6e6;border-radius:12px;"
  loading="lazy"
  title="Refract Issues View"
></iframe>

<!-- Project view -->
<iframe
  src="https://cdn.yoursite.com/refract-embed/#project?embed=1"
  width="100%"
  height="720"
  style="border:1px solid #e6e6e6;border-radius:12px;"
  loading="lazy"
  title="Refract Project View"
></iframe>

<!-- Diff view -->
<iframe
  src="https://cdn.yoursite.com/refract-embed/#diff?embed=1"
  width="100%"
  height="480"
  style="border:1px solid #e6e6e6;border-radius:12px;"
  loading="lazy"
  title="Refract Diff View"
></iframe>

<!-- Quality dashboard -->
<iframe
  src="https://cdn.yoursite.com/refract-embed/#quality?embed=1"
  width="100%"
  height="860"
  style="border:1px solid #e6e6e6;border-radius:12px;"
  loading="lazy"
  title="Refract Quality Dashboard"
></iframe>
```

### Hash routes

| Hash | View |
|------|------|
| `#diff` | Diff View (side-by-side) |
| `#issues` | Issues review (3 columns) |
| `#project` | Project view (top bar + issues) |
| `#quality` | Quality dashboard |

Add `?embed=1` to hide the dev navigation bar.

### Local preview

```bash
cd embed
npm install
npm run dev
```

Open `http://localhost:5173/#issues` (port may vary).

## Suggested iframe dimensions

| View | Min width | Height |
|------|-----------|--------|
| Diff | 720px | 400–500px |
| Issues | 960px | 600–720px |
| Project | 1024px | 720px |
| Quality Dashboard | 800px | 800–900px |

## Folder structure

```
embed/
├── tokens.css              # CSS variables (required)
├── mock/demoData.ts        # Static demo issues, snapshots, drift
├── shared/                 # Types, colors, ImpactBadge
├── lib/diff.ts             # Myers diff for UnifiedDiffView
├── components/
│   ├── DiffViewEmbed.tsx
│   ├── IssuesReviewEmbed.tsx
│   ├── ProjectViewEmbed.tsx
│   ├── QualityDashboardEmbed.tsx
│   └── charts/             # ScoreRing, HealthTrendChart, etc.
└── iframe/                 # Vite app for static build
    ├── main.tsx
    ├── index.html
    └── vite.config.ts
```

## Dark mode

Set `data-theme="dark"` on `<html>` or a wrapper element. Tokens are defined in `tokens.css`.

```html
<html data-theme="dark">
```
