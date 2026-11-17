# Revise

A local-only, keyboard-driven way to revise your Notion toggles while keeping each page in its original order. Each toggle gets a status dot (hollow = not started, amber = due, green = scheduled with time left).

It is **not** part of the deployed site (that is a public static export). It runs on your machine, keeps your Notion token in `revise/.env`, and stores review state in `revise/data/reviews.json`. Both are gitignored.

## Setup

1. Go to https://www.notion.so/profile/integrations and create an internal integration. Copy its secret.
2. In Notion, open each lecture page (or a parent page that contains them) → ••• → Connections → add the integration.
3. Create `revise/.env`:
   ```
   NOTION_TOKEN=ntn_xxx
   ```
4. Run `npm run revise` and open http://localhost:3939

No token yet? `npm run revise:demo` runs with fake lecture data.

## How a revision pass works

Move with `j`/`k`, press `t` to open a toggle with a 30s study timer, let it close, say it back from memory, press `Space` to check, then grade with `1` Again, `2` Hard, `3` Good or `4` Easy. The toggle closes and the cursor moves on. `n` jumps to the next due toggle in page order. Press `?` for every shortcut.

Scheduling is a simple SM-2 style rule in `server.mjs` (`schedule`). Toggles are tracked by Notion block ID, so renaming or editing a toggle keeps its schedule. Deleting and retyping one does not.
