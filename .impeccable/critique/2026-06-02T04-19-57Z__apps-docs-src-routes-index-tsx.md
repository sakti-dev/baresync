---
target: landing page
total_score: 28
p0_count: 0
p1_count: 0
p2_count: 2
p3_count: 2
timestamp: 2026-06-02T04-19-57Z
slug: apps-docs-src-routes-index-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Copy button feedback works; no loading states for package manager commands |
| 2 | Match System / Real World | 3 | Technical but appropriate for developer audience; "What Baresync gives you" framing is clear |
| 3 | User Control and Freedom | 3 | Package manager tabs are switchable; no other interactive states to test |
| 4 | Consistency and Standards | 2 | Badge colors in FeatureGrid and WhatYouControl use different visual languages; hardcoded inline styles vs design tokens |
| 5 | Error Prevention | 3 | No interactive error paths on landing page; static content |
| 6 | Recognition Rather Than Recall | 3 | Clear section headings; code blocks are scannable |
| 7 | Flexibility and Efficiency | 2 | No way to deep-link to specific features; no anchor navigation between sections |
| 8 | Aesthetic and Minimalist Design | 2 | FeatureGrid badges feel templated; WhatYouControl column labels look misplaced |
| 9 | Error Recovery | 3 | N/A for static landing page |
| 10 | Help and Documentation | 3 | Quick start section and docs link are present |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict

**LLM assessment**: The landing page avoids the worst AI slop traps (no cream bg, no gradient text, no glassmorphism). However, two sections betray template origins:

1. **FeatureGrid badges** ("Reliability", "Consistency", "Performance", "Architecture") use the classic "small colored tag above heading" pattern that reads as AI scaffolding. The tags are decorative labels that restate what the description already says. Every card has the same structure: tag + title + paragraph. This is the "identical card grids" ban.

2. **WhatYouControl column labels** ("Your code" / "Baresync") use colored badges that look like they belong to a different design system. The green badge for "Your code" and gray badge for "Baresync" create a visual hierarchy problem: the badges are the most prominent element in each column, but they're the least important information. The column headers should be text, not badges.

**Deterministic scan**: No automated findings (clean output).

## Overall Impression

The hero section is strong: the ripple effect is memorable, the code block with package manager tabs is functional, and the "How sync works" step-by-step with code examples is excellent technical communication. The problems are concentrated in two mid-page sections that feel like they were designed by a different hand than the hero and the sync walkthrough.

## What's Working

1. **Hero section**: The interactive ripple grid is a genuine differentiator. It gives the page a physical feel that most developer tool landing pages lack. The copy "You own the backend" is sharp and specific.

2. **HowSyncWorks step-by-step**: Numbered steps with code examples and connecting lines create a clear mental model. The code is real, not pseudocode. This section builds confidence.

3. **Package manager tabs**: Small detail, but switching between bun/npm/pnpm/yarn with live command updates shows attention to the developer audience.

## Priority Issues

### P2 — FeatureGrid badges feel like AI scaffolding

**What**: The "Reliability", "Consistency", "Performance", "Architecture" badges above each feature title use the "tiny colored tag + heading + paragraph" template. Two cards share the same tag ("Reliability" appears twice, "Performance" appears twice), which makes the tags feel like category labels rather than meaningful differentiators.

**Why it matters**: The badges don't add information — the title and description already explain the feature. They create visual noise and make the section feel templated. A developer scanning this section sees six identical card shapes with colored rectangles, which is the "identical card grids" anti-pattern.

**Fix**: Remove the category badges entirely. Let the feature titles and descriptions carry the weight. If categorization matters, group features by theme (reliability, performance, architecture) with section dividers instead of inline tags. Alternatively, make each badge unique and meaningful — if two features share a tag, that's a signal the tag isn't pulling its weight.

**Suggested command**: `/impeccable quieter` or `/impeccable distill`

### P2 — WhatYouControl column labels look misplaced

**What**: The "Your code" and "Baresync" labels are rendered as colored badges (green for "Your code", gray for "Baresync") that visually dominate each column. The badges use hardcoded inline rgba values that don't match the design token system. The gray badge for "Baresync" looks washed out against the dark background.

**Why it matters**: The column labels should be clear headings, not decorative badges. The badge treatment makes them feel like they belong to a different component. The green/gray color contrast between the two columns creates an unintended hierarchy: "Your code" looks more important than "Baresync", but the point of the section is to show both sides as equal partners.

**Fix**: Replace the badges with plain text headings. Use the same typography as other section headings (font-semibold, text-fd-foreground). If you want to visually distinguish the two columns, use a subtle background tint or border treatment instead of colored badges. The bullet lists are fine — they're scannable and specific.

**Suggested command**: `/impeccable quieter`

### P3 — Hardcoded inline colors bypass design tokens

**What**: FeatureGrid uses `TAG_COLORS` with hardcoded rgba values (emerald, amber, sky, violet). WhatYouControl has inline `style` props with hardcoded rgba. These don't reference the design token system in `app.css`.

**Why it matters**: If the palette changes, these colors won't update. It's a maintenance issue and a consistency risk. The tag colors were chosen independently from the lime accent palette, creating a subtle disconnect.

**Fix**: Map tag colors to the existing semantic tokens (`--color-fd-success`, `--color-fd-warning`, `--color-fd-info`, `--color-fd-idea`) or define new tokens in the theme. If the badges are removed (per P2 above), this becomes moot.

**Suggested command**: `/impeccable polish`

### P3 — Section header repetition pattern

**What**: Three sections (FeatureGrid, HowSyncWorks, WhatYouControl) use the same header pattern: `<div className="border-fd-border border-y"><div className="mx-auto max-w-4xl px-6 py-6 text-center"><h2>...</h2><p>...</p></div></div>`. The "How sync works" section breaks this with a different header treatment, which is good.

**Why it matters**: Repeated structural patterns make the page feel monotonous. Each section should have its own visual weight and rhythm.

**Fix**: Vary the header treatments. FeatureGrid could skip the bordered header entirely and go straight to the cards. WhatYouControl could use a simpler text header without the border treatment.

**Suggested command**: `/impeccable layout`

## Minor Observations

- The footer is minimal (one line). Consider adding links to docs, GitHub, and a brief tagline.
- The QuickStart section says "seven commands" but lists exactly seven — good, the count is accurate.
- The `HowSyncWorks` section uses numbered circles with connecting lines, which is a nice visual treatment that the other sections could learn from.

## Questions to Consider

- What if the FeatureGrid section led with the most impressive feature (outbox pattern) as a larger hero-style callout, with the remaining five as smaller supporting items?
- Does the WhatYouControl section need two columns, or would a single list with clear ownership annotations ("you handle this, Baresync handles this") be clearer?
- Should the page have a "Why not X?" section that addresses common alternatives (WatermelonDB, CRDTs, Realm) to build credibility?
