---
name: txdl
description: The Seeder's Console — a full-bleed monospace instrument for the seed → clean → move → remove pipeline
colors:
  ground: "#0d110e"
  panel: "#111711"
  panel-raised: "#151c15"
  panel-hover: "#1a221a"
  rule: "#26302a"
  rule-soft: "#1c241e"
  text: "#dde8da"
  muted: "#93a093"
  dim: "#7a867d"
  signal-cyan: "#4cc2c8"
  ok-green: "#52c25d"
  obligation-amber: "#d6b849"
  danger-red: "#d05a4a"
  sel-bg: "#dde8da"
  sel-ink: "#0d110e"
  paper-ground: "#f2f2ec"
  paper-ink: "#1c241d"
typography:
  body:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12.5px"
    lineHeight: 1.5
    fontVariant: "tabular-nums"
  label:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "10.5px"
    fontWeight: 600
    letterSpacing: "0.05em"
    textTransform: "uppercase"
  secondary:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "11.5px"
    lineHeight: 1.5
  readout:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "15px"
    fontWeight: 700
  title:
    fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "16px"
    fontWeight: 700
rounded:
  none: "0px"
spacing:
  cell: "6px 12px"
  cell-head: "8px 12px"
  section: "14px 16px"
  shell: "0 16px 60px"
components:
  button:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "5px 12px"
  button-primary:
    backgroundColor: "{colors.signal-cyan}"
    textColor: "{colors.sel-ink}"
  filter-token:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    padding: "4px 6px"
  filter-token-active:
    backgroundColor: "{colors.sel-bg}"
    textColor: "{colors.sel-ink}"
  status-word:
    textColor: "{colors.ok-green}"
    typography: "{typography.label}"
  block-gauge:
    textColor: "{colors.signal-cyan}"
  command-line:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    padding: "7px 16px"
---

# Design System: txdl

## Overview

**Creative North Star: "The Seeder's Console"**

txdl is a full-bleed monospace instrument: the interface a private-tracker seeder reads like terminal output. Every pixel is a character cell in spirit — ui-monospace type throughout, 1px hairline rules as the only structure, color used exclusively as signal, and state changes that happen instantly, the way a console repaints a line. The world refuses the web-dashboard kit it was born as: no rounded panels, no soft shadows, no gradient washes, no pills, no entrance animations, no decorative blur.

Selection is inverted video — the console's own idiom. Obligations read as amber type, graduates as green, transfers as cyan, danger as red. A light "paper terminal" theme (ink on paper, same grammar) exists behind the same tokens.

**Key Characteristics:**
- One typeface, one size family: ui-monospace at 12.5px body, 10.5px uppercase labels, 15–16px readouts
- Zero radius, zero shadows; 1px rules carry all structure
- ANSI-hue signal vocabulary; color never decorates
- Full-bleed grid, no centered column, no sidebar
- No motion except state transitions (0.08s background, 0.12s sort arrows)

## Colors

Dark terminal is canonical; light is the same grammar on paper.

### Primary
- **Signal Cyan** (#4cc2c8): the interactive hue — links, focus accents, active download gauges, primary buttons' ground. One hue owns "the machine is acting."

### Secondary
- **Obligation Amber** (#d6b849): HR seed debt, queued/checking states, warnings. Anything the tracker still owes.
- **Danger Red** (#d05a4a): destructive actions, errors, offline lamp.

### Tertiary
- **OK Green** (#52c25d): seeding, graduation, archive-ready, satisfied requirements.

### Neutral
- **Ground** (#0d110e): near-black with a green cast — the phosphor-tinted field, not neutral #000.
- **Panel** (#111711) / **Panel Raised** (#151c15) / **Panel Hover** (#1a221a): the three surface steps; raised is barely lighter than ground.
- **Rule** (#26302a) / **Rule Soft** (#1c241e): hairline borders; soft is the in-row divider.
- **Text** (#dde8da) / **Muted** (#93a093) / **Dim** (#7a867d): bright, base, and secondary type; all pass 4.5:1 on ground.
- **Selection** (#dde8da ground / #0d110e ink): inverted-video pair.

Light theme (paper terminal): Paper Ground #f2f2ec, Paper Ink #1c241d, cyan #106d78, green #1e7c33, amber #7d620a, red #b0392c; inversion flips (dark ink bar, paper text).

### Named Rules
**The Signal Rule.** Color carries state and nothing else: cyan = transfer/interactive, green = satisfied, amber = owed, red = destructive. No hue appears as decoration.
**The One Ground Rule.** Dark ground is green-cast near-black (#0d110e), never neutral #000 or blue-slate; light ground is warm paper (#f2f2ec), never pure white.

## Typography

**Body Font:** ui-monospace → SF Mono → Menlo → Consolas
**Label Font:** same stack, uppercase, 0.05em tracking

**Character:** One monospace voice for everything — data, labels, actions, prose. The mono is the material (a console), not a costume; no sans or serif joins it.

### Hierarchy
- **Title** (700, 16px, 1.35): torrent names on the detail page, page-level headings.
- **Readout** (700, 15px): stat values in the detail grid — bright numerals, tabular.
- **Body** (400, 12.5px, 1.5): table cells, controls, dialog copy; tabular-nums globally.
- **Secondary** (400, 11.5px): sub-labels, counts, hints, status words, badge markers, back links.
- **Label** (600, 10.5px, uppercase, 0.05em): table headers, stat labels, modal titles, filter tokens' brackets.

### Named Rules
**The One Voice Rule.** Every glyph on every surface is the mono stack. A second typeface is a foreign object.

## Layout

Full-bleed single column: a sticky statusline (brand, aggregate rates, connection lamp, theme toggle) over a token row (bracketed filters, search, actions), then the torrent grid at 100% viewport width minus 16px gutters. No max-width, no sidebar, no cards. The table scrolls inside its own bordered box with a pinned uppercase header row; column widths are fixed by colgroup and user-resizable (Name). Density: 6px vertical cell padding, 12px horizontal.

Detail page: head block (title, status word, path), then a 1px-ruled stat grid (cells share borders — a readout panel, not floating cards), then bordered sections for Hit & Run, Junk cleanup, Files.

## Elevation & Depth

**No shadows, no radius, no blur.** Depth does not exist; structure is 1px rules and the three panel tones. The modal is a bordered pane (1px text-color border) on a 72% ground scrim — a drawn window frame, not a floating sheet.

### Named Rules
**The Flat Pane Rule.** Surfaces are flat planes divided by hairlines. A shadow, a radius, or a backdrop blur is a foreign element.

## Shapes

Rectangles only: every corner is 0px. Controls are bordered rectangles; the connection lamp is a 7px square; gauges are 10-cell block-character strings (`█████░░░░░`, cyan, green when done); filter tokens wrap their label in `[ ` ` ]` bracket characters; the selection command line prefixes its count with `> `. Edge markers (HR amber, ready green) are 1px inset rules on the row's first cell.

## Components

### Filter tokens
- **Style:** borderless text buttons, brackets as `::before`/`::after` in rule color; count in 11px.
- **State:** active = inverted video (sel-bg ground, sel-ink text, bold); hover = bright text, dim brackets.

### Status words
- **Style:** the status column renders a colored uppercase word, not a badge: LEECH (cyan), SEED (green), IDLE (dim), QUEUE/CHECK (amber), ERR (red). Errors carry their message in the title attribute.

### Progress gauge
- **Style:** 10 block characters, filled cells in cyan (`█`), empty in `░`; done/complete turns green. `role="progressbar"` on the wrapper, characters `aria-hidden`, the visible percent label adjacent.

### Buttons
- **Shape:** 1px rule border, panel-raised ground, 5px 12px padding, 0 radius.
- **Primary:** cyan ground, ink text, bold; hover brightens the border.
- **Danger:** transparent ground, red text, 55% red border.
- **Icon buttons:** 26px square, transparent until hover.

### Table
- **Style:** panel ground inside a 1px rule-soft box; uppercase dim header row pinned; rows divided by rule-soft hairlines; hover = panel-hover.
- **Selection:** inverted video; nested dim/muted content flips to ink; HR/ready edge markers flip to sel-dim.

### Command line (selection bar)
- **Style:** fixed full-width bottom bar, panel ground, 1px top rule; count prefixed `> ` in cyan; actions as small bordered buttons; destructive tail after a 1px separator.

### Modal
- **Style:** bordered pane (1px text border), uppercase muted title bar, no animation, no shadow. Escape and backdrop click close; focus trapped inside.

### Toast
- **Style:** bottom-right status message, 1px top/left rules, 7px square indicator (cyan; red for errors). No animation.

## Do's and Don'ts

### Do:
- **Do** use color only as signal per The Signal Rule.
- **Do** render selection as inverted video everywhere rows are selected.
- **Do** keep all numerals tabular; all text mono.
- **Do** let state changes be instant or ≤0.12s; there is no entrance motion.
- **Do** express progress as block characters or a 1px-ruled structure.

### Don't:
- **Don't** introduce radius, shadows, gradients, glows, pills, or backdrop blur.
- **Don't** add a second typeface or a decorative accent color.
- **Don't** center the shell or cap its width; the console is full-bleed.
- **Don't** restyle state as decoration (e.g. a colored pill for a status the signal words already carry).
- **Don't** animate layout properties; repaint like a console, don't slide like a page.
