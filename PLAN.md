# Personal site — Build Plan

A personal site for Arafat Rais. Home introduces who he is; Projects is a
separate page. Room to grow into tutoring later.

## Who this is for

Arafat Rais. Second year medical student at Imperial College London.
Interested in medtech. Founder of **ImpulsiQ**, an AI question generator that
builds exam questions from a medical school's own curriculum and marks them
with the reasoning for each answer. Live at impulsiq.co.uk.

The site is **about him first**. Projects are a page you navigate to, not the
homepage's main event.

Still needed from him: contact email on the domain (not the personal Gmail),
tutoring details and timing, and one line about what he wants to do with
medtech. Marked `[in brackets]` in the mockup.

## Real projects

| Project | Platform |
|---|---|
| ImpulsiQ — AI exam question generator for medical students | Web, live |
| UCAT Remote Calculator — replica of the exam's on-screen calculator | Web |
| Verbal Reasoning trainer | Web |
| ModuAlarm — modular local-first alarm clock | iOS 17 |
| AQA question bank — generates Chemistry practice papers | Python |
| Lecture library — raw lectures into a searchable PDF library | Python |
| PDF page picker | Python |
| Notion export tool — flattens nested toggles to markdown | Node |

## Decisions made

| Decision | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Static pages now, real backend later, no rewrite |
| Language | TypeScript | Catches mistakes as you type; better AI assistance |
| Styling | Tailwind CSS + shadcn/ui | Fast to write; components you own and can edit |
| Host | Vercel (free Hobby tier) | Push to GitHub, deploys itself |
| Domain | undecided — shortlist below | ~£4–9/yr |
| Data | Browser storage, abstracted | Free; swappable for a database without touching projects |

Total running cost: **~£10/year** (the domain). Everything else is free.

## Domain shortlist (decide later, nothing is blocked on it)

Verified available, all flat renewal (no first-year bait):

| Domain | Price/yr |
|---|---|
| arafatrais.com | ~£8.50 |
| byarafat.com / itsarafat.com / hiarafat.com | ~£8.50 |
| byarafat.co.uk / itsarafat.co.uk | ~£4.30 |
| arafat.build | ~£20 |
| arafat.io | £21 then **£40/yr** |

Buy from **Porkbun** (sells near cost, flat renewals). Avoid Namecheap
(.com renews $18.48), Gandi ($38.38) and GoDaddy first-year bait. Avoid
.xyz/.site/.space/.fun/.lol entirely — ~£1.50 year one, £10–24 after.

Taken: arafat.com, arafat.co.uk, arafat.uk, arafat.me, arafat.dev,
arafatrais.dev, arafatlabs.com.

## Architecture

### The project registry
Every mini-project is a self-contained folder that exports metadata plus a
component. The homepage and gallery are generated from that registry, so
adding project #15 is: create folder, write tool, done. No plumbing.

    src/projects/
      compound-interest/
        meta.ts        <- slug, title, blurb, tags, featured?
        index.tsx      <- the tool itself
      collatz-visualiser/
        meta.ts
        index.tsx

Each project lazy-loads, so a heavy one never slows the rest of the site.

### The storage layer (answers "might need to save data later")
Projects never talk to localStorage directly. They call one small hook:

    const [state, setState] = useProjectStorage('compound-interest', initial)

Today that writes to the browser. If a project later needs data synced across
devices or shared with other people, we swap the hook's internals for a
database (Supabase free tier) and **not one project file changes**.

### Routes

    /                    who he is: hero, about, now
    /projects            the projects page, filterable by tag
    /projects/<slug>     each project, its own shareable link
    /tutoring            (later)
    /notes               (later — blog; useful for tutoring SEO)

## Design direction (settled)

**Palette: Signal / Green.** Greyscale chrome with colour used only where it
means something. Reference thread across Watch Dogs Legion, COD Cold War and
Loki's TVA is retrofuturist institutional design: instruments, signage,
terminals. Good fit, because this site is a rack of instruments.

| Role | Treatment |
|---|---|
| Chrome | Greyscale. Nav, cards, borders, headings, body. Most of the page. |
| Interactive | Green. Links, buttons, focus rings, active inputs. |
| Alert | Red. Errors and warnings only, never borrowed. |
| Confirmed | No colour. Checkmark plus weight change. |
| Data | Green leads; other hues allowed inside charts only. |

The rule: **colour appears when something is interactive, changing, or being
measured. Never otherwise.** This is what keeps fifteen unrelated tools looking
like one site, and it is why charts can use colour freely.

Tokens (dark / light):

    bg        #101011 / #F4F4F3
    surface   #191919 / #FFFFFF
    line      #272728 / #E1E1DF
    muted     #86868A / #5B5B59
    text      #EEEEEF / #111111
    accent    #2FC48A / #0E8A5C
    alert     #F2555A / #CC2229

**Type: Zilla Slab (display) + Fira Sans (body) + Fira Mono (numbers).**
All three are Mozilla faces, drawn to sit together. The colour system withholds
personality on purpose, so the type supplies it. Mono is functional, not
decorative: every tool prints numbers and digits need tabular alignment.

**Rejected and why:** amber/CRT palettes (the terminal look every AI site
ships); warm cream and beige (same); a fourth "positive" colour (would make
green mean two things).

**Layout:** centred hero landing page in the 21st.dev idiom — masked grid
background that reacts to the cursor, radial glow arc, gradient-clipped
display type, staggered fade-in. Green accent and Zilla Slab instead of the
usual violet and geometric sans, so it does not read as a template.

Mockups live in `design/` and open straight in a browser:
- `design/layout-reference.html` — the site
- `design/palette-and-type.html` — how palette and type were chosen

Hosted copies:
- Layout: https://claude.ai/code/artifact/32742946-0248-4204-b2e6-0d973f7ddbd9
- Specimens: https://claude.ai/code/artifact/62ec08b4-0685-4c9c-b198-3e78fc5decea

## Phases

**Phase 0 — Accounts** (you, ~20 min)
Buy arafatrais.com. Create GitHub account if needed. Create Vercel account,
sign in with GitHub.

**Phase 1 — Pipeline first**
Scaffold Next.js, push to GitHub, connect Vercel, attach the domain.
Goal: a nearly-empty site live at arafatrais.com on day one. Getting the
deploy loop working before there's content to debug is worth the impatience.

**Phase 2 — The shell**
Layout, navigation, home page, about page, dark mode. Colour and type are
settled (above); layout is the remaining design work.

**Phase 3 — Registry + first project**
Build the registry, the gallery page, the project page template, and one
real project end to end to prove the pattern.

**Phase 4 — Fill it out**
2–3 more projects. Social preview images so shared links look right.
Sitemap, metadata, analytics.

**Phase 5 — Later**
Tutoring page. Blog. Database, if a project earns it.

## Known trade-offs

- **Vercel's free tier is officially non-commercial.** Fine for a project
  gallery. If tutoring becomes paid, either pay $20/mo or move to Cloudflare
  (Next.js runs there via an adapter — roughly half a day of work, not a
  rewrite). Not a decision needed now.
- **Next.js is more concepts than a plain Vite SPA.** Accepted deliberately,
  because the tutoring direction is undecided and this keeps every door open.
