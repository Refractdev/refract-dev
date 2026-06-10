# Refract

**Transform AI-generated code into maintainable, production-ready software.**

Refract is a code quality platform that analyzes your codebase, detects structural issues, and helps you fix them — from AST-powered scanning to one-click pull requests with clean, documented code.

---

## Features

### 🔍 Code Analysis Engine
Scans every file using AST parsing with 15+ built-in detectors: oversized components, `any`-type leakage, missing error boundaries, circular dependencies, dead state, prop drilling, and more. Cross-file analysis detects patterns no linter catches.

### 📊 Quality Dashboard
Health scores (0–100) per project, trend tracking over time, drill-down into specific issues by file, cross-project visibility. See exactly where your codebase needs attention.

### ⚡ Smart Refactoring
Each issue comes with a before/after diff, impact/effort scoring, and priority ordering. Accept suggestions individually or in batch — Pro/Team users can generate a pull request with all changes applied.

### 📝 Documentation Generation
Generate or update README files, API docs, and architecture overviews automatically — always in sync with your codebase.

### 📈 Drift Monitoring
Track code quality over time. Get alerts when scores drop, categories spike, or files start decaying — so you catch regressions before they compound.

### 🛡️ Safety-First Design
Read-only analysis by default. All modifications go through pull requests that you review and merge. No silent changes, no force pushes, no surprises.

---

## How It Works

1. **Connect** — Link a GitHub repository and select a branch.
2. **Analyze** — Refract scans every file, runs all detectors, and builds an import map. Results in minutes.
3. **Review & Refactor** — Browse issues sorted by priority, preview diffs, accept suggestions, and generate a PR with a single click.

---

## Plans

| Feature | Free | Pro | Team |
|---------|------|-----|------|
| AST analysis | ✅ | ✅ | ✅ |
| 15+ detectors | ✅ | ✅ | ✅ |
| Quality dashboard | ✅ | ✅ | ✅ |
| Drift monitoring | ✅ | ✅ | ✅ |
| AI-powered suggestions | — | ✅ | ✅ |
| One-click PR generation | — | ✅ | ✅ |
| Auto-documentation | — | ✅ | ✅ |
| CI/CD integration | — | — | ✅ |
| Team collaboration | — | — | ✅ |

---

## Getting Started

1. Visit **[refract.dev](https://refract.dev)** and sign in with GitHub.
2. Connect a repository and run your first analysis.
3. Review your results and start refactoring.

---

## Documentation

Full documentation, including infrastructure setup and deployment guides, is available in the `docs/` directory.

---

## License

Refract is proprietary software. Usage is subject to the Terms of Service and Privacy Policy at [refract.dev/legal](https://refract.dev/legal).

© 2026 Refract Inc. All rights reserved.