# Anatomy Spotter data build

Rebuilds `public/anatomy/` (the meshes and `parts.json` used by `/anatomy`) from BodyParts3D 4.0.

1. Download into a folder `BP` from https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/:
   `partof_BP3D_4.0_obj_99.zip` (unzip into `BP/raw/`), `partof_inclusion_relation_list.txt`,
   `isa_inclusion_relation_list.txt`.
2. `python3 scripts/anatomy/classify.py BP` sorts every part into a system (writes `BP/els.json`).
3. In a scratch folder: `npm i meshoptimizer@0.22.0`, copy `pack.mjs` there, then
   `node pack.mjs BP <repo>/public/anatomy`. This simplifies each mesh, quantises it to 16-bit,
   and writes one `.bin` per system plus `parts.json`.

BodyParts3D, © The Database Center for Life Science, licensed CC BY-SA 2.1 JP
(https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). The simplified meshes in
`public/anatomy/` are a derivative and are shared under the same licence.
