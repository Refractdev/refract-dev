# Refract 10x Plan
**Version 0.1 · Internal Product Roadmap**

## Goal
Transform Refract from an MVP that helps review AI-generated code into a product that is sticky, commercially viable, and hard to replace.

The product should feel like a senior engineering system that:
- detects code health decay before it becomes visible to the team
- protects users from unsafe refactors
- performs specialized structural refactoring without depending on AI for the actual transformation
- gives a visual map of the codebase that is useful, not decorative

## Product Principles

1. The core workflow must stay simple: detect issues, explain them, fix them safely, and keep history.
2. AI should help with context, documentation, and analysis, but not be the refactoring engine itself.
3. The product must earn trust before it earns automation.
4. The Free plan must be basic, but genuinely useful.
5. The Teams plan must create retention through continuous visibility and shared policy enforcement.
6. Every feature must have its own dedicated code file and clearly isolated implementation lines.

## V1 Mandatory System Pillars

### 1. Drift Monitor
Status: **Coming soon / phased rollout**

This is a core legacy pillar, even if the first public version ships in stages.

What it must do:
- connect to the GitHub App
- observe each push and commit
- detect drift, anomalies, regressions, and suspicious code changes
- keep a visible history of health changes over time
- surface charts and trends, not only plain text alerts

The first version should not be a mock. It needs a real data pipeline, real storage, and real visual reporting.

### 2. Safety Guarantee

Every proposed change must go through a safety gate before the user trusts it.

The safety layer should validate:
- syntax
- type safety
- build integrity
- critical test coverage when relevant

If a change breaks the code, the system should catch it before it is presented as safe or ready.

### 3. Specialized Refactoring Engine

This is a full engine rewrite.

AI is not the refactoring engine. AI is used to:
- understand the codebase context
- help generate documentation
- explain what the code is doing
- summarize risks and tradeoffs

The refactoring engine itself should handle the structural work developers hate doing manually:
- component decomposition
- state consolidation
- file and module restructuring
- import and dependency cleanup
- API centralization
- code organization rules

### 4. Improved CodeMap

The CodeMap must become a real architectural view of the repository.

It should:
- show file and dependency relationships
- make risk areas visible
- help users understand how changes propagate
- support the review and refactor workflow directly

The goal is not a static diagram. The goal is an interactive map that helps users make decisions faster.

## Features Not Included in V1

The following ideas are intentionally excluded from the first mandatory system build:

- zero-friction onboarding via public Lovable / Bolt / zip import flows
- direct conversation steering inside the refactor sidebar

These may come later, but they should not slow down the core system rebuild.

## Differentiators That Can Make Refract 10x Better

### Impact Radar / Blast Radius
Before a refactor is applied, show the likely impact:
- affected files
- dependent components
- test risk
- probable breakage surface

This makes the product feel like a senior tech lead, not a basic linter.

### Proof-of-Safety Bundle
Every accepted change should include proof:
- typecheck result
- build result
- relevant tests
- optional visual validation for UI work

If anything fails, the system should explain the failure and help reduce the change into a safer shape.

### Repo Memory + Policy Engine
Refract should learn the repo's real rules over time:
- architecture boundaries
- naming conventions
- forbidden patterns
- preferred module shapes

This creates retention because the product becomes tuned to each codebase instead of acting like a generic assistant.

## Product Packaging

### Free
Basic but functional.

Should include:
- one connected repository
- manual analysis and review flow
- accept / reject decisions
- decision history
- exportable changelog
- CodeMap lite
- limited history and limited runs

Should not include:
- continuous Drift Monitor
- PR automation
- team policies
- shared dashboards

### Pro
For individual developers who want stronger automation.

Should include:
- advanced refactoring engine
- safety gate on patches
- richer analysis history
- more runs and more repository capacity
- stronger export and changelog tooling
- power-user CodeMap features

### Teams
For shared codebase ownership and retention.

Should include:
- Drift Monitor
- GitHub App and webhook workflow
- shared health trends and reports
- shared architectural policies
- team-wide visibility
- alerts when code quality decays
- recurring monitoring and historical reporting

## V1 Success Criteria

The first meaningful version should answer these questions clearly:
- does it detect real drift after commits and pushes?
- does it protect users from unsafe changes?
- does the refactoring engine actually restructure code well?
- does the CodeMap help users understand the repo faster?
- does the Free plan feel useful enough to activate users?
- does Pro or Teams feel worth paying for because it saves time and reduces risk?

## Positioning

Refract should not be positioned as "another AI coding tool".
It should be positioned as the system that keeps AI-generated code understandable, safe, and maintainable over time.

The product promise is simple:
AI can generate the code.
Refract makes sure the code survives.
