---
name: Baresync
description: SQLite-first sync infrastructure for Tauri apps
colors:
  primary: "#6bc725"
  primary-deep: "#3d8a0e"
  background: "#212224"
  card: "#292a2d"
  muted: "#2e3033"
  secondary: "#343638"
  foreground: "#edecef"
  muted-foreground: "#9d9ea1"
  border: "#393b3e"
  accent: "#393b3e"
  ring: "#6bc72566"
  info: "#3da2e0"
  warning: "#c4a24d"
  error: "#a33c3c"
  success: "#3cb878"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
  code-block:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Baresync

## 1. Overview

**Creative North Star: "The Quiet Terminal"**

A dark, cool-toned surface that reads like a well-configured terminal: calm authority, no visual noise, every element earning its place. The palette is anchored by cool blue-tinted neutrals (hue 250) and a single lime accent that appears sparingly, like a cursor blinking on a dark screen. This is infrastructure documentation, not a SaaS landing. The system explicitly rejects cream backgrounds, warm sand tones, gradient text, and the "AI-generated marketing" aesthetic. Baresync's docs should feel like reading well-written code: clear, direct, and confident.

**Key Characteristics:**
- Dark-first with high-contrast cool neutrals
- Lime accent used surgically, never decoratively
- Flat depth model: borders and tonal shifts, not shadows
- Inter + JetBrains Mono pairing: functional and readable
- Border-based separation, not cards or elevation

## 2. Colors

The palette is cool and restrained: near-black surfaces with a subtle blue cast, a bright lime accent for primary actions and focus, and muted grays that stay readable without fighting for attention.

### Primary
- **Lime** (oklch(0.83 0.18 120) / #6bc725): Primary accent. Used for links, focus rings, selection highlights, the "Get started" button, and the hero grid's interactive cells. This is the only saturated color in the system. Its rarity is intentional.
- **Lime Deep** (oklch(0.55 0.16 120) / #3d8a0e): Darker lime for light mode primary elements and hover states on lime backgrounds.

### Neutral
- **Surface Base** (oklch(0.13 0.008 250) / #212224): The page background. Cool-tinted near-black.
- **Surface Card** (oklch(0.16 0.008 250) / #292a2d): Raised surfaces: code blocks, sidebars, popovers.
- **Surface Muted** (oklch(0.18 0.008 250) / #2e3033): Subtle containers, sidebar backgrounds.
- **Surface Secondary** (oklch(0.2 0.008 250) / #343638): Interactive surface hover states.
- **Border** (oklch(0.22 0.008 250) / #393b3e): Structural borders, dividers, card edges.
- **Foreground** (oklch(0.93 0.005 240) / #edecef): Primary text. High contrast on dark surfaces.
- **Muted Foreground** (oklch(0.62 0.01 240) / #9d9ea1): Secondary text, descriptions, labels. Maintains 4.5:1+ contrast on all dark surfaces.

### Semantic
- **Info** (oklch(62.3% 0.214 259.815)): Informational callouts.
- **Warning** (oklch(76.9% 0.188 70.08)): Caution states.
- **Error** (oklch(63.7% 0.237 25.331)): Error states.
- **Success** (oklch(72.3% 0.219 149.579)): Success states.

### Named Rules

**The Lime restraint Rule.** The primary lime accent appears on no more than 10% of any given viewport. Its power comes from scarcity. When in doubt, use foreground text or a border instead.

**The Cool Neutral Rule.** All surface and text colors use cool-tinted neutrals (hue 240-250). Never tint toward warm or beige. The body background is not cream, sand, or parchment. It is a cool near-black.

## 3. Typography

**Display Font:** Inter (with system fallbacks)
**Body Font:** Inter (with system fallbacks)
**Mono Font:** JetBrains Mono (with Fira Code, ui-monospace, monospace fallback)

**Character:** A single sans-serif family in multiple weights. Inter is optimized for screens and reads cleanly at all sizes. JetBrains Mono pairs for code with distinct ligatures. The pairing is functional, not decorative.

### Hierarchy
- **Display** (700, clamp(2.25rem, 5vw, 3.75rem), 1.1): Hero headlines only. Letter-spacing -0.02em. text-wrap: balance.
- **Headline** (600, 1.75rem, 1.2): Section titles. Strong but not competing with the hero.
- **Title** (600, 1.25rem, 1.3): Subsection headings, card titles.
- **Body** (400, 1rem, 1.6): Prose text. Max line length 65-75ch for readability.
- **Label** (500, 0.875rem, 1.4): Navigation items, tab labels, small UI text.
- **Code** (400, 0.875rem, 1.5): Inline code, code blocks. JetBrains Mono with OpenType features cv01-cv09.

### Named Rules

**The Single Family Rule.** Inter handles all non-code text. No display serifs, no decorative fonts. Weight contrast (400 vs 700) creates hierarchy, not a second typeface.

## 4. Elevation

This system is flat. Depth is conveyed through border separation and tonal shifts between surface layers, not through drop shadows. The surface hierarchy (background → card → muted → secondary) creates visual depth by stepping lightness, not by lifting elements off the page. Shadows are absent from all default states.

### Shadow Vocabulary

No shadow vocabulary exists. Elements at rest are flat. If shadows are needed in the future (e.g., for dropdowns or modals), they should be subtle and structural, not decorative.

### Named Rules

**The Flat-By-Default Rule.** No element has a drop shadow at rest. Depth comes from border + background contrast. Shadows may appear only for overlay layers (dialogs, popovers) and must be nearly invisible.

## 5. Components

### Buttons
- **Shape:** 8px radius (rounded-md)
- **Primary:** Lime background (oklch(0.83 0.18 120)), dark foreground (oklch(0.13 0.008 250)), 10px 24px padding, 500 font-weight
- **Hover / Focus:** Darken lime by 10% or shift to lime-deep. Focus ring: 2px solid lime at 40% opacity with 2px offset.
- **Secondary / Ghost:** Transparent background, foreground text, 1px border-border. Hover: accent background.

### Code Blocks
- **Corner Style:** 8px radius (rounded-md)
- **Background:** Surface card (oklch(0.16 0.008 250))
- **Border:** 1px solid border (oklch(0.22 0.008 250))
- **Internal Padding:** 16px

### Inline Code
- **Background:** Surface muted (oklch(0.18 0.008 250))
- **Padding:** 2px 6px
- **Radius:** 4px
- **Font size:** 0.875em relative to parent

### Navigation
- **Style:** Fixed top bar, same max-width as content area. Border-bottom for separation.
- **Typography:** Label weight (500), 0.875rem
- **Default/Active:** Muted foreground text; active state uses foreground text.

### Links (in prose)
- **Style:** Underline with lime underline-offset 3px, text-decoration-color at 40% lime opacity
- **Hover:** text-decoration-color full lime opacity
- **No underline on hover:** transition text-decoration-color 150ms ease-out

## 6. Do's and Don'ts

### Do:
- **Do** use lime sparingly. It is the only saturated color. Its rarity is the point.
- **Do** use cool-tinted neutrals (hue 240-250) for all surfaces and text. The body background is a cool near-black, never warm or beige.
- **Do** separate elements with borders and tonal shifts, not shadows.
- **Do** maintain 4.5:1 contrast for body text, 3:1 for large text. Muted foreground (oklch(0.62)) on dark surfaces meets this threshold.
- **Do** use Inter for all non-code text and JetBrains Mono for code. No other font families.

### Don't:
- **Don't** use cream, sand, beige, or warm-tinted backgrounds. The body is cool near-black (oklch(0.13 0.008 250)).
- **Don't** use gradient text (`background-clip: text`). Single solid colors only.
- **Don't** use glassmorphism, backdrop blurs, or decorative frosted glass.
- **Don't** add drop shadows to cards, buttons, or containers at rest.
- **Don't** use the "hero-metric template" (big number, small label, gradient accent). This is a SaaS cliché.
- **Don't** put identical card grids with icon + heading + text repeated across sections.
- **Don't** use "revolutionary", "game-changing", "seamless", or any marketing buzzword in copy.
- **Don't** use numbered section eyebrows (01 / 02 / 03) unless the content is genuinely a sequence.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe.
