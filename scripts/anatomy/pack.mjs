import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
const [,, bp, out] = process.argv;
await MeshoptSimplifier.ready;
const els = JSON.parse(fs.readFileSync(bp + '/els.json', 'utf8')).filter(e => e.sys !== 'skip');
const SYS = ['Skeleton', 'Muscles', 'Organs', 'Vessels', 'Nervous'];
fs.mkdirSync(out, { recursive: true });
const parts = [];
// global bounds so all systems share one coordinate frame
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
const meshes = new Map();
for (const e of els) {
  const txt = fs.readFileSync(`${bp}/raw/partof_BP3D_4.0_obj_99/${e.file}.obj`, 'utf8');
  const pos = [], idx = [];
  for (const l of txt.split('\n')) {
    if (l.startsWith('v ')) { const a = l.split(/\s+/); pos.push(+a[1], +a[2], +a[3]); }
    else if (l.startsWith('f ')) {
      const a = l.trim().split(/\s+/).slice(1).map(t => parseInt(t) - 1);
      for (let i = 1; i + 1 < a.length; i++) idx.push(a[0], a[i], a[i + 1]);
    }
  }
  const P = new Float32Array(pos);
  let I = new Uint32Array(idx);
  const tris = I.length / 3;
  const target = Math.max(240, Math.min(tris, Math.round(tris * 0.35))) * 3;
  if (target < I.length) {
    const [s] = MeshoptSimplifier.simplify(I, P, 3, target, 0.01, ['LockBorder']);
    if (s.length >= 36) I = s;
  }
  // compact vertices
  const map = new Map(), np = [];
  const ni = new Uint32Array(I.length);
  for (let k = 0; k < I.length; k++) {
    let v = map.get(I[k]);
    if (v === undefined) { v = map.size; map.set(I[k], v); np.push(P[I[k] * 3], P[I[k] * 3 + 1], P[I[k] * 3 + 2]); }
    ni[k] = v;
  }
  for (let k = 0; k < np.length; k++) { mn[k % 3] = Math.min(mn[k % 3], np[k]); mx[k % 3] = Math.max(mx[k % 3], np[k]); }
  meshes.set(e.file, { pos: np, idx: ni });
}
const scale = mx.map((v, i) => (v - mn[i]) / 65535);
let total = 0;
for (const sys of SYS) {
  const bufs = []; let off = 0;
  for (const e of els.filter(x => x.sys === sys)) {
    const m = meshes.get(e.file);
    const vc = m.pos.length / 3;
    const q = new Uint16Array(m.pos.length);
    for (let k = 0; k < q.length; k++) q[k] = Math.round((m.pos[k] - mn[k % 3]) / scale[k % 3]);
    const ib = vc < 65536 ? new Uint16Array(m.idx) : m.idx;
    const pad = (b) => { const n = Buffer.from(b.buffer, b.byteOffset, b.byteLength); const r = n.length % 4; return r ? Buffer.concat([n, Buffer.alloc(4 - r)]) : n; };
    const a = pad(q), b = pad(ib);
    let cx = 0, cz = 0;
    for (let k = 0; k < m.pos.length; k += 3) { cx += m.pos[k]; cz += m.pos[k + 2]; }
    cx /= vc; cz /= vc;
    const r = cz > 1365 ? 'Head & neck' : Math.abs(cx) > 135 && cz > 700 ? 'Upper limb' : cz < 760 ? 'Lower limb' : 'Trunk';
    parts.push({ f: e.file, c: e.cid, n: e.name, s: sys, r, o: off, v: vc, i: m.idx.length, w: ib.BYTES_PER_ELEMENT });
    bufs.push(a, b); off += a.length + b.length; total += m.idx.length / 3;
  }
  fs.writeFileSync(`${out}/${sys.toLowerCase()}.bin`, Buffer.concat(bufs));
}
fs.writeFileSync(`${out}/parts.json`, JSON.stringify({ min: mn, scale, systems: SYS, parts }));
console.log('parts', parts.length, 'tris', total);
