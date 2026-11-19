import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export type Part = {
  f: string; // BodyParts3D element file id
  c: string; // FMA concept id
  n: string; // English name
  s: string; // system
  r: string; // region
  o: number; // byte offset in the system's .bin
  v: number; // vertex count
  i: number; // index count
  w: number; // bytes per index
};

export type Manifest = {
  min: [number, number, number];
  scale: [number, number, number];
  systems: string[];
  parts: Part[];
};

export type Mark = "select" | "target" | "right" | "wrong";

const BASE = "/anatomy/";

const MARK_COLORS: Record<Mark, number> = {
  select: 0x3fa9f5,
  target: 0xffb020,
  right: 0x2fbf71,
  wrong: 0xe5484d,
};

function baseColor(p: Part) {
  const n = p.n.toLowerCase();
  switch (p.s) {
    case "Skeleton":
      return /cartilage|meniscus|disc/.test(n) ? 0xb9d3dc : 0xe9dfc9;
    case "Muscles":
      return /tendon|aponeurosis|retinaculum|tract/.test(n) ? 0xe2d6c2 : 0xb4514a;
    case "Vessels":
      return /vein|vena|venous|sinus|tributary/.test(n) ? 0x4061c4 : 0xc8313a;
    case "Nervous":
      return /nerve|plexus/.test(n) ? 0xf0cf5a : 0xe7c2b4;
    default:
      if (/bronch|trachea/.test(n)) return 0x9fc7d8;
      if (/liver|hepat/.test(n)) return 0x8e3b2f;
      if (/duct|biliary|gallbladder/.test(n)) return 0x6da34d;
      return 0xd98f78;
  }
}

type MeshInfo = { mesh: THREE.Mesh; part: Part; base: THREE.Color };

export class AnatomyEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private byConcept = new Map<string, MeshInfo[]>();
  private all: MeshInfo[] = [];
  private loaded = new Map<string, Promise<void>>();
  private raycaster = new THREE.Raycaster();
  private frameAnim: { t0: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private down: { x: number; y: number } | null = null;
  private hoverQueued: PointerEvent | null = null;
  private fade: number | null = null;
  private marks = new Map<string, Mark>();
  private visibleFn: (p: Part) => boolean = () => true;

  onPick: (cid: string | null) => void = () => {};
  onHover: ((cid: string | null, x: number, y: number) => void) | null = null;

  constructor(private el: HTMLElement, private manifest: Manifest) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 1, 5, 20000);
    this.camera.position.set(0, 1500, 2600);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.target.set(0, 1500, 0);
    this.controls.minDistance = 30;
    this.controls.maxDistance = 6000;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x404858, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(0.6, 1, 1.2);
    this.camera.add(key);
    this.scene.add(this.camera);

    // BodyParts3D is z-up with anterior towards -y; turn it to three's y-up, facing +z.
    this.root.rotation.x = -Math.PI / 2;
    this.scene.add(this.root);

    const canvas = this.renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", this.handleDown);
    canvas.addEventListener("pointerup", this.handleUp);
    canvas.addEventListener("pointermove", this.handleMove);
    canvas.addEventListener("pointerleave", this.handleLeave);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    for (const m of this.all) {
      m.mesh.geometry.dispose();
      (m.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  isLoaded(sys: string) {
    return this.loaded.has(sys);
  }

  loadSystem(sys: string): Promise<void> {
    const existing = this.loaded.get(sys);
    if (existing) return existing;
    const p = (async () => {
      const res = await fetch(`${BASE}${sys.toLowerCase()}.bin`);
      if (!res.ok) throw new Error(`Could not load ${sys} (${res.status})`);
      const buf = await res.arrayBuffer();
      const { min, scale } = this.manifest;
      for (const part of this.manifest.parts) {
        if (part.s !== sys) continue;
        const q = new Uint16Array(buf, part.o, part.v * 3);
        const pos = new Float32Array(part.v * 3);
        for (let k = 0; k < pos.length; k++) pos[k] = min[k % 3] + q[k] * scale[k % 3];
        const ioff = part.o + Math.ceil((part.v * 6) / 4) * 4;
        const idx = part.w === 2 ? new Uint16Array(buf, ioff, part.i).slice() : new Uint32Array(buf, ioff, part.i).slice();
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        g.computeBoundingBox();
        const base = new THREE.Color(baseColor(part));
        const mat = new THREE.MeshStandardMaterial({ color: base.clone(), roughness: 0.62, metalness: 0.02 });
        const mesh = new THREE.Mesh(g, mat);
        mesh.userData.cid = part.c;
        const info = { mesh, part, base };
        this.all.push(info);
        const list = this.byConcept.get(part.c) ?? [];
        list.push(info);
        this.byConcept.set(part.c, list);
        this.root.add(mesh);
      }
      this.apply();
    })();
    this.loaded.set(sys, p);
    p.catch(() => this.loaded.delete(sys));
    return p;
  }

  setVisibility(fn: (p: Part) => boolean) {
    this.visibleFn = fn;
    this.apply();
  }

  /** fade: opacity for unmarked structures, or null to draw them solid. */
  setMarks(marks: Map<string, Mark>, fade: number | null) {
    this.marks = marks;
    this.fade = fade;
    this.apply();
  }

  private apply() {
    const anyMark = this.marks.size > 0;
    for (const { mesh, part, base } of this.all) {
      mesh.visible = this.visibleFn(part);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const mark = this.marks.get(part.c);
      if (mark) {
        mat.color.setHex(MARK_COLORS[mark]);
        mat.emissive.setHex(MARK_COLORS[mark]).multiplyScalar(0.35);
      } else {
        mat.color.copy(base);
        mat.emissive.setHex(0);
      }
      const faded = this.fade !== null && anyMark && !mark;
      mat.transparent = faded;
      mat.opacity = faded ? this.fade! : 1;
      mat.depthWrite = !faded;
      mesh.renderOrder = faded ? 1 : 0;
      mat.needsUpdate = true;
    }
  }

  /** Smoothly move the camera to fit a structure, or the whole visible body when cid is null. */
  frame(cid: string | null, keepDirection = true) {
    const box = new THREE.Box3();
    const infos = cid ? this.byConcept.get(cid) ?? [] : this.all.filter((m) => m.mesh.visible);
    if (!infos.length) return;
    this.root.updateMatrixWorld(true);
    for (const { mesh } of infos) {
      const b = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      box.union(b);
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, cid ? 40 : 100);
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(this.camera.fov / 2))) * (cid ? 2.4 : 1.05);
    const dir = keepDirection
      ? this.camera.position.clone().sub(this.controls.target).normalize()
      : new THREE.Vector3(0, 0.05, 1).normalize();
    this.frameAnim = {
      t0: performance.now(),
      fromT: this.controls.target.clone(),
      toT: sphere.center.clone(),
      fromP: this.camera.position.clone(),
      toP: sphere.center.clone().add(dir.multiplyScalar(dist)),
    };
  }

  /** Rotate the view to a named direction around the current target. */
  view(side: "front" | "back" | "left" | "right") {
    const d = this.camera.position.distanceTo(this.controls.target);
    // Patient's left is +x, so looking at their left side means standing at +x.
    const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] } as const;
    const dir = new THREE.Vector3(...dirs[side]).multiplyScalar(d);
    this.frameAnim = {
      t0: performance.now(),
      fromT: this.controls.target.clone(),
      toT: this.controls.target.clone(),
      fromP: this.camera.position.clone(),
      toP: this.controls.target.clone().add(dir),
    };
  }

  private pick(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = this.all
      .filter(({ mesh }) => mesh.visible && !(mesh.material as THREE.Material).transparent)
      .map((m) => m.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    return hit ? (hit.object.userData.cid as string) : null;
  }

  private handleDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private handleUp = (e: PointerEvent) => {
    if (!this.down) return;
    const moved = Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y);
    this.down = null;
    if (moved < 6) this.onPick(this.pick(e.clientX, e.clientY));
  };

  private handleMove = (e: PointerEvent) => {
    if (!this.onHover || e.buttons) return;
    this.hoverQueued = e;
  };

  private handleLeave = () => {
    this.hoverQueued = null;
    this.onHover?.(null, 0, 0);
  };

  private resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.frameAnim) {
      const a = this.frameAnim;
      const t = Math.min(1, (performance.now() - a.t0) / 550);
      const k = 1 - Math.pow(1 - t, 3);
      this.controls.target.lerpVectors(a.fromT, a.toT, k);
      this.camera.position.lerpVectors(a.fromP, a.toP, k);
      if (t >= 1) this.frameAnim = null;
    }
    if (this.hoverQueued && this.onHover) {
      const e = this.hoverQueued;
      this.hoverQueued = null;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.onHover(this.pick(e.clientX, e.clientY), e.clientX - rect.left, e.clientY - rect.top);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
