# Design reference

Static HTML mockups. **Not the app.** They exist so the real Next.js build
has something exact to match. Open them straight in a browser.

| File | What it is |
|---|---|
| `layout-reference.html` | The site design. Home and Projects, via the nav. Hero background reacts to the cursor. Theme button in the top strip. |
| `palette-and-type.html` | How the palette and typefaces were chosen. 22 palettes, 16 faces, live mixer. Reference only, the decision is already made. |

Both files carry a grey annotation strip at the top. That strip is scaffolding
for review and must not be built into the real site.

## The decision, in short

**Palette: Signal / Green.** Greyscale everywhere; colour only where something
is interactive, changing, or being measured.

| Role | Treatment |
|---|---|
| Chrome | Greyscale. Nav, cards, borders, headings, body. Most of the page. |
| Interactive | Green. Links, buttons, focus rings, active inputs. |
| Alert | Red. Errors and warnings only, never borrowed. |
| Confirmed | No colour. A checkmark and a weight change. |
| Data | Green leads; other hues allowed inside charts only. |

Tokens are defined at the top of `layout-reference.html` as CSS custom
properties, light in `:root` and dark in both the `prefers-color-scheme`
media query and `[data-theme="dark"]`. Port them to Tailwind v4 `@theme`
verbatim; do not re-pick the values.

**Type:** Zilla Slab (display) / Fira Sans (body) / Fira Mono (numbers).
All three are Mozilla faces drawn to sit together. Load via `next/font/google`.
Mono is functional, not decorative: tools print numbers and digits need
`tabular-nums`.

## Notes for whoever builds this

- The hero's cursor-reactive grid is two stacked grids: a grey one, and the
  same grid in green revealed through a radial mask that follows the pointer.
  Pointer position is written to CSS custom properties inside one rAF per
  move. Keep it that way; do not put pointer coordinates in React state.
- Motion is deliberate and documented in a comment block in the CSS. Every
  animation earns its place, nothing loops, all of it collapses under
  `prefers-reduced-motion`.
- The projects grid uses a row rhythm (4+2, 3+3, 2+2+2) that recalculates so a
  row never ends with an empty cell. See `sizesFor()`.
- Anything in [square brackets] is copy Arafat still needs to write.
