import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== MATH =====
function pmt(P, rate, years) {
  const r = rate / 100 / 12;
  const n = years * 12;
  if (r === 0) return P / n;
  return P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function amortize(P, rate, years, extra = 0, fortnightly = false) {
  const r = rate / 100 / 12;
  const base = pmt(P, rate, years);
  const pay = fortnightly ? (base / 2) * (26 / 12) : base + extra;
  let bal = P, totalInt = 0;
  const sched = [{ month: 0, balance: P }];
  let m = 0;
  while (bal > 0.01 && m < 600) {
    m++;
    const interest = bal * r;
    let pp = pay - interest;
    if (pp > bal) pp = bal;
    if (pp < 0) pp = 0;
    bal = Math.max(0, bal - pp);
    totalInt += interest;
    sched.push({ month: m, balance: Math.round(bal) });
  }
  return { baseMonthly: Math.round(base), effectiveMonthly: Math.round(pay), totalInterest: Math.round(totalInt), months: m, schedule: sched };
}

function balAt(sched, target) {
  const e = sched.find(s => s.month >= target);
  return e ? e.balance : 0;
}

function fmt$(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '$0';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n);
}

function fmtYM(m) {
  const y = Math.floor(m / 12), mo = m % 12;
  if (y === 0) return `${mo}mo`;
  if (mo === 0) return `${y}y`;
  return `${y}y ${mo}mo`;
}

// ===== STATE =====
const state = {
  principal: 600000, rate: 6.5, years: 30,
  strategy: 'extra', extra: 500, newRate: 5.5,
  baseline: null, strategyResult: null,
  isPlaying: false, playStart: 0, playDuration: 6000,
};

const COMING_SOON = ['roundup', 'offset', 'negotiate'];

// ===== THREE.JS SETUP =====
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 40, 100);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 16, 32);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 18;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.target.set(0, 3.5, 0);
controls.autoRotate = false;
controls.autoRotateSpeed = 0.3;

// Lights
scene.add(new THREE.AmbientLight(0xffeedd, 0.5));

const sun = new THREE.DirectionalLight(0xffaa55, 1.3);
sun.position.set(15, 20, 12);
sun.castShadow = true;
sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;
sun.shadow.camera.left = -20;
sun.shadow.camera.right = 20;
sun.shadow.camera.top = 20;
sun.shadow.camera.bottom = -20;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
scene.add(sun);

scene.add(new THREE.DirectionalLight(0x88ccff, 0.25).position.set(-10, 8, -10));
scene.add(new THREE.HemisphereLight(0x87CEEB, 0x4a7c3f, 0.35));

// Ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x5a9e3f, roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Driveway
const drive = new THREE.Mesh(
  new THREE.PlaneGeometry(3.5, 12),
  new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9 })
);
drive.rotation.x = -Math.PI / 2;
drive.position.set(10.5, 0.01, 12);
drive.receiveShadow = true;
scene.add(drive);

// Path
const path = new THREE.Mesh(
  new THREE.PlaneGeometry(1.2, 4),
  new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.85 })
);
path.rotation.x = -Math.PI / 2;
path.position.set(0, 0.02, 9);
path.receiveShadow = true;
scene.add(path);

// Fence
function makeFence(zOff) {
  const g = new THREE.Group();
  const fm = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.7 });
  for (let i = -6; i <= 6; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, 0.12), fm);
    p.position.set(i * 1.5, 0.5, zOff);
    p.castShadow = true;
    g.add(p);
  }
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(19, 0.08, 0.08), fm);
  r1.position.set(0, 0.75, zOff); g.add(r1);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(19, 0.08, 0.08), fm);
  r2.position.set(0, 0.35, zOff); g.add(r2);
  return g;
}
scene.add(makeFence(14));

// Trees
function tree(x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 2.5 * s, 8),
    new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 })
  );
  trunk.position.y = 1.25 * s; trunk.castShadow = true; g.add(trunk);
  const fol = new THREE.Mesh(
    new THREE.SphereGeometry(1.2 * s, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x3d6b3d, roughness: 0.9 })
  );
  fol.position.y = 2.8 * s; fol.scale.y = 0.7; fol.castShadow = true; g.add(fol);
  g.position.set(x, 0, z); return g;
}
scene.add(tree(-16, 8, 1.2));
scene.add(tree(16, 6, 0.9));
scene.add(tree(-14, -8, 1));

// Water tank
const tankM = new THREE.MeshStandardMaterial({ color: 0x2e5a3e, roughness: 0.6, metalness: 0.2 });
const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 24), tankM);
tank.position.set(-8.5, 0.9, -5); tank.castShadow = true; scene.add(tank);
const tankLid = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.08, 24), new THREE.MeshStandardMaterial({ color: 0x1a3a2a }));
tankLid.position.set(-8.5, 1.84, -5); scene.add(tankLid);



// ==================== HOUSE BUILDER ====================

const MAX_H = 8.5;
const COLORS = {
  roof: 0x3d3e40, wall: 0xd4c5b0, frame: 0xffffff,
  glass: 0x1a2a3a, door: 0x8B4513, garage: 0x3d3e40,
  foundation: 0x8a8a8a, post: 0xffffff, chimney: 0x8a8a8a
};

function makeClippable(mat) {
  mat.clippingPlanes = [];
  mat.clipShadows = true;
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = 1;
  mat.polygonOffsetUnits = 1;
  return mat;
}

function gableRoof(w, d, h) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(0, h); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.center(); return g;
}

function buildHouse(offsetX, isStrategy) {
  const group = new THREE.Group();
  group.position.x = offsetX;
  scene.add(group);

  const wireColor = isStrategy ? 0x00d4ff : 0xf59e0b;
  const wireMat = new THREE.LineBasicMaterial({ color: wireColor, transparent: true, opacity: 0.4 });
  const parts = [];

  function add(geo, mat, x, y, z, rx, ry, rz, name, milestone) {
    rx = rx || 0; ry = ry || 0; rz = rz || 0;
    const m = new THREE.Mesh(geo, mat.clone());
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = true; m.receiveShadow = true;
    if (name) { m.userData = { name, milestone }; parts.push(m); }
    group.add(m);
    const e = new THREE.EdgesGeometry(geo);
    const w = new THREE.LineSegments(e, wireMat);
    w.position.copy(m.position); w.rotation.copy(m.rotation); w.scale.copy(m.scale);
    group.add(w);
    return m;
  }

  const wallMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.85 }));
  const roofMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.5, metalness: 0.3 }));
  const foundMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.foundation, roughness: 0.9 }));
  const doorMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.door, roughness: 0.7 }));
  const frameMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.frame, roughness: 0.5 }));
  const glassMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.glass, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.7 }));
  const garageMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.garage, roughness: 0.4, metalness: 0.4 }));
  const postMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.post, roughness: 0.6 }));
  const chimMat = makeClippable(new THREE.MeshStandardMaterial({ color: COLORS.chimney, roughness: 0.9 }));

  add(new THREE.BoxGeometry(10, 0.35, 8), foundMat, 0, 0.175, 0, 0, 0, 0, 'Foundation', 'Slab poured');
  add(new THREE.BoxGeometry(10, 3.2, 0.25), wallMat, 0, 1.775, 3.875, 0, 0, 0, 'Front Wall', 'Frame up');
  add(new THREE.BoxGeometry(10, 3.2, 0.25), wallMat, 0, 1.775, -3.875, 0, 0, 0, 'Back Wall', 'Frame up');
  add(new THREE.BoxGeometry(0.25, 3.2, 8), wallMat, -4.875, 1.775, 0, 0, 0, 0, 'Left Wall', 'Frame up');
  add(new THREE.BoxGeometry(0.25, 3.2, 8), wallMat, 4.875, 1.775, 0, 0, 0, 0, 'Right Wall', 'Frame up');
  add(new THREE.BoxGeometry(0.2, 3, 4.5), wallMat, 2.5, 1.65, -1.75, 0, 0, 0, 'Internal Wall', 'Rooms framed');
  add(gableRoof(11, 9, 2.2), roofMat, 0, 4.5, 0, 0, 0, 0, 'Main Roof', 'Roof on');
  add(gableRoof(4.5, 4.5, 1.4), roofMat, 5.5, 3.9, -1.75, 0, 0, 0, 'Garage Roof', 'Garage complete');
  add(new THREE.BoxGeometry(10.5, 0.12, 2.2), roofMat, 0, 3.5, 4.8, 0.08, 0, 0, 'Verandah Roof', 'Outdoor living');
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    add(new THREE.BoxGeometry(0.15, 3.3, 0.15), postMat, x, 1.65, 5.5, 0, 0, 0, 'Verandah Post', 'Outdoor living');
  }
  add(new THREE.BoxGeometry(1.1, 2.2, 0.08), doorMat, 0, 1.45, 4.0, 0, 0, 0, 'Front Door', 'Lock-up stage');
  add(new THREE.BoxGeometry(1.3, 2.4, 0.1), frameMat, 0, 1.45, 3.98, 0, 0, 0, 'Door Frame', 'Lock-up stage');
  add(new THREE.BoxGeometry(2.8, 2.4, 0.08), garageMat, 5.5, 1.55, 3.98, 0, 0, 0, 'Garage Door', 'Lock-up stage');

  function win(x, y, z, w, h, ry) {
    ry = ry || 0;
    add(new THREE.BoxGeometry(w + 0.15, h + 0.15, 0.1), frameMat, x, y, z, 0, ry, 0, 'Window Frame', 'Windows in');
    const gm = glassMat.clone();
    gm.clippingPlanes = []; gm.clipShadows = true; gm.polygonOffset = true; gm.polygonOffsetFactor = 1; gm.polygonOffsetUnits = 1;
    add(new THREE.BoxGeometry(w, h, 0.06), gm, x, y, z + (ry === 0 ? 0.02 : 0), 0, ry, 0, 'Window Glass', 'Windows in');
  }
  win(-2.5, 2.3, 4.0, 1.4, 1.2, 0);
  win(2.5, 2.3, 4.0, 1.4, 1.2, 0);
  add(new THREE.BoxGeometry(0.1, 1.2, 1.4), frameMat, -4.9, 2.3, 0, 0, 0, 0, 'Side Window', 'Windows in');
  add(new THREE.BoxGeometry(0.06, 1.0, 1.2), glassMat.clone(), -4.92, 2.3, 0, 0, 0, 0, 'Side Window Glass', 'Windows in');
  add(new THREE.BoxGeometry(0.1, 1.2, 1.4), frameMat, 4.9, 2.3, 0, 0, 0, 0, 'Side Window', 'Windows in');
  add(new THREE.BoxGeometry(0.06, 1.0, 1.2), glassMat.clone(), 4.92, 2.3, 0, 0, 0, 0, 'Side Window Glass', 'Windows in');
  add(new THREE.BoxGeometry(1.4, 1.2, 0.1), frameMat, 0, 2.3, -3.9, 0, 0, 0, 'Back Window', 'Windows in');
  add(new THREE.BoxGeometry(1.2, 1.0, 0.06), glassMat.clone(), 0, 2.3, -3.92, 0, 0, 0, 'Back Window Glass', 'Windows in');
  add(new THREE.BoxGeometry(0.6, 2, 0.6), chimMat, 2.5, 4.5, -2.5, 0, 0, 0, 'Chimney', 'Services connected');
  add(new THREE.BoxGeometry(10.4, 0.12, 0.4), wallMat, 0, 3.45, 4.1, 0, 0, 0, 'Eaves', 'Exterior details');
  add(new THREE.BoxGeometry(10.4, 0.12, 0.4), wallMat, 0, 3.45, -4.1, 0, 0, 0, 'Eaves', 'Exterior details');

  return { group, parts, wireMat };
}

const baselineHouse = buildHouse(-12, false);
const strategyHouse = buildHouse(12, true);

// Clipping planes
const baseClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const stratClip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

function applyClip(group, plane) {
  group.traverse(c => {
    if (c.isMesh && c.material && c.material.clippingPlanes !== undefined) {
      c.material = c.material.clone();
      c.material.clippingPlanes = [plane];
    }
  });
}
applyClip(baselineHouse.group, baseClip);
applyClip(strategyHouse.group, stratClip);

// ==================== GAP VISUALIZATION ====================

const gapBeamMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0 });
const gapBeam = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.06), gapBeamMat);
scene.add(gapBeam);

const gapPillarMat = new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0 });
const gapPillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), gapPillarMat);
const gapPillarR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 8), gapPillarMat);
gapPillarL.position.set(-6, 0, 0);
gapPillarR.position.set(6, 0, 0);
scene.add(gapPillarL);
scene.add(gapPillarR);

// Floating labels
const labelBase = document.createElement('div');
labelBase.className = 'house-label';
labelBase.innerHTML = `
  <div class="hl-badge" style="border-color:#f59e0b;">
    <div class="hl-title" style="color:#f59e0b">Without strategy</div>
    <div class="hl-sub" id="hlBaseSub">Year 0 — 0%</div>
  </div>
  <div class="hl-arrow" style="border-top-color:#f59e0b;"></div>
`;
document.body.appendChild(labelBase);

const labelStrat = document.createElement('div');
labelStrat.className = 'house-label';
labelStrat.innerHTML = `
  <div class="hl-badge" style="border-color:#00d4ff;">
    <div class="hl-title" style="color:#00d4ff">With extra $500/mo</div>
    <div class="hl-sub" id="hlStratSub">Year 0 — 0%</div>
  </div>
  <div class="hl-arrow" style="border-top-color:#00d4ff;"></div>
`;
document.body.appendChild(labelStrat);

const gapLabel = document.createElement('div');
gapLabel.className = 'gap-label';
gapLabel.id = 'gapLabel';
document.body.appendChild(gapLabel);

const labelStyle = document.createElement('style');
labelStyle.textContent = `
.house-label {
  position: fixed;
  pointer-events: none;
  text-align: center;
  z-index: 5;
  transition: opacity 0.3s;
}
.house-label .hl-badge {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border: 2px solid;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
.house-label .hl-title {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}
.house-label .hl-sub {
  font-size: 0.85rem;
  color: #cbd5e1;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  margin-top: 4px;
  font-weight: 500;
}
.house-label .hl-arrow {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid;
  margin: 4px auto 0;
  opacity: 0.8;
}
.gap-label {
  position: fixed;
  pointer-events: none;
  text-align: center;
  z-index: 5;
  font-size: 0.9rem;
  font-weight: 700;
  color: #34d399;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  padding: 8px 16px;
  border-radius: 12px;
  border: 2px solid #34d399;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 20px rgba(52, 211, 153, 0.15);
  opacity: 0;
  transition: opacity 0.3s;
}
.gap-label.visible { opacity: 1; }
`;
document.head.appendChild(labelStyle);

function updateLabels() {
  const v = new THREE.Vector3();
  const hw = window.innerWidth / 2, hh = window.innerHeight / 2;

  v.set(-12, MAX_H + 2.8, 0); v.project(camera);
  labelBase.style.left = (v.x * hw + hw) + 'px';
  labelBase.style.top = (-v.y * hh + hh - 20) + 'px';
  labelBase.style.transform = 'translate(-50%, -100%)';
  labelBase.style.opacity = v.z < 1 ? '1' : '0';

  v.set(12, MAX_H + 2.8, 0); v.project(camera);
  labelStrat.style.left = (v.x * hw + hw) + 'px';
  labelStrat.style.top = (-v.y * hh + hh - 20) + 'px';
  labelStrat.style.transform = 'translate(-50%, -100%)';
  labelStrat.style.opacity = v.z < 1 ? '1' : '0';

  const bh = baseClip.constant, sh = stratClip.constant;
  if (sh > bh + 0.5) {
    v.set(0, (bh + sh) / 2 + 0.5, 0); v.project(camera);
    gapLabel.style.left = (v.x * hw + hw) + 'px';
    gapLabel.style.top = (-v.y * hh + hh) + 'px';
    gapLabel.style.transform = 'translate(-50%, -50%)';
    gapLabel.classList.add('visible');
  } else {
    gapLabel.classList.remove('visible');
  }
}


// ==================== SCAN LINES & EFFECTS ====================

const scanMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.06, side: THREE.DoubleSide });
const scanLineMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });

const baseScan = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), scanMat.clone());
baseScan.rotation.x = -Math.PI / 2;
scene.add(baseScan);
const baseScanLine = new THREE.Mesh(new THREE.BoxGeometry(14, 0.03, 12), scanLineMat.clone());
scene.add(baseScanLine);
const baseScanLight = new THREE.PointLight(0xf59e0b, 0.8, 15);
scene.add(baseScanLight);

const stratScan = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), scanMat);
stratScan.rotation.x = -Math.PI / 2;
scene.add(stratScan);
const stratScanLine = new THREE.Mesh(new THREE.BoxGeometry(14, 0.03, 12), scanLineMat);
scene.add(stratScanLine);
const stratScanLight = new THREE.PointLight(0x00d4ff, 0.8, 15);
scene.add(stratScanLight);

const baseLight = new THREE.PointLight(0xffaa55, 0, 12);
baseLight.position.set(-12, 2.5, 0); scene.add(baseLight);
const stratLight = new THREE.PointLight(0xffaa55, 0, 12);
stratLight.position.set(12, 2.5, 0); scene.add(stratLight);

// Particles
const PC = 80;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PC * 3);
const pVel = [];
for (let i = 0; i < PC; i++) {
  pPos[i*3] = (Math.random()-0.5)*12; pPos[i*3+1] = 0; pPos[i*3+2] = (Math.random()-0.5)*10;
  pVel.push({ x:(Math.random()-0.5)*0.01, y:Math.random()*0.015+0.005, z:(Math.random()-0.5)*0.01 });
}
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0x00d4ff, size: 0.05, transparent: true, opacity: 0.35 });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

// ==================== TOOLTIP & RAYCASTER ====================

const tooltip = document.createElement('div');
tooltip.style.cssText = 'position:fixed;background:rgba(10,10,24,0.92);backdrop-filter:blur(12px);color:#e2e8f0;padding:10px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);font-size:0.82rem;pointer-events:none;opacity:0;transition:opacity 0.15s;z-index:100;max-width:220px;';
document.body.appendChild(tooltip);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hovered = null;

function onMouseMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const allParts = [...baselineHouse.parts, ...strategyHouse.parts];
  const hits = raycaster.intersectObjects(allParts);
  if (hits.length > 0) {
    const mesh = hits[0].object;
    if (hovered !== mesh) {
      if (hovered && hovered.material.emissive) hovered.material.emissive.setHex(0x000000);
      hovered = mesh;
      if (mesh.material.emissive) mesh.material.emissive.setHex(0x223344);
      const isStrat = strategyHouse.parts.includes(mesh);
      const houseName = isStrat ? 'Strategy house' : 'Baseline house';
      const color = isStrat ? '#00d4ff' : '#f59e0b';
      tooltip.innerHTML = `<strong>${mesh.userData.name}</strong><br><span style="color:#94a3b8;font-size:0.75rem">${mesh.userData.milestone}</span><br><span style="color:${color};font-size:0.7rem;margin-top:2px;display:block">${houseName}</span>`;
      tooltip.style.opacity = '1';
    }
    tooltip.style.left = (e.clientX + 15) + 'px';
    tooltip.style.top = (e.clientY + 15) + 'px';
    document.body.style.cursor = 'pointer';
  } else {
    if (hovered) { if (hovered.material.emissive) hovered.material.emissive.setHex(0x000000); hovered = null; }
    tooltip.style.opacity = '0';
    document.body.style.cursor = 'default';
  }
}
window.addEventListener('mousemove', onMouseMove);

// ==================== UI REFERENCES ====================

const elPrincipal = document.getElementById('inputPrincipal');
const elRate = document.getElementById('inputRate');
const elYears = document.getElementById('inputYears');
const elSliderExtra = document.getElementById('sliderExtra');
const elValExtra = document.getElementById('valExtra');
const elStrategyControl = document.getElementById('strategyControl');
const elTimeline = document.getElementById('timeline');
const elYearLabel = document.getElementById('yearLabel');
const elPhaseLabel = document.getElementById('phaseLabel');
const elAheadLabel = document.getElementById('aheadLabel');
const elPlayBtn = document.getElementById('playBtn');
const elToast = document.getElementById('toast');
const elStrategyTiles = document.querySelectorAll('.strategy-tile');
const elMTiles = document.querySelectorAll('.m-tile');
const elLoader = document.getElementById('loader');
const elBottomSheet = document.getElementById('bottomSheet');
const elSheetHandle = document.getElementById('sheetHandle');
const elMobileMetricsToggle = document.getElementById('mobileMetricsToggle');
const elMobileMetricsPanel = document.getElementById('mobileMetricsPanel');
const elCloseMobileMetrics = document.getElementById('closeMobileMetrics');

const milestones = {
  slab: document.getElementById('msSlab'),
  frame: document.getElementById('msFrame'),
  roof: document.getElementById('msRoof'),
  lockup: document.getElementById('msLockup'),
  windows: document.getElementById('msWindows'),
  fitout: document.getElementById('msFitout'),
  complete: document.getElementById('msComplete')
};

// ==================== MILESTONE LOGIC ====================

const PHASES = [
  { name: 'Slab', min: 0, max: 0.5, key: 'slab' },
  { name: 'Frame', min: 0.5, max: 2.5, key: 'frame' },
  { name: 'Roof', min: 2.5, max: 4.5, key: 'roof' },
  { name: 'Lock-up', min: 4.5, max: 5.5, key: 'lockup' },
  { name: 'Windows', min: 5.5, max: 6.0, key: 'windows' },
  { name: 'Fit-out', min: 6.0, max: 7.0, key: 'fitout' },
  { name: 'Complete', min: 7.0, max: 8.5, key: 'complete' }
];

function getPhase(height) {
  for (const p of PHASES) {
    if (height >= p.min && height < p.max) return p;
  }
  return PHASES[PHASES.length - 1];
}

function updateMilestones(baseH, stratH) {
  Object.values(milestones).forEach(m => { m.classList.remove('active', 'past'); });
  const sp = getPhase(stratH);
  PHASES.forEach(p => {
    const el = milestones[p.key];
    if (p === sp) el.classList.add('active');
    else if (stratH >= p.max) el.classList.add('past');
  });
}

// ==================== UPDATE LOGIC ====================

function updateCalculations() {
  state.principal = Number(elPrincipal.value) || 600000;
  state.rate = Number(elRate.value) || 6.5;
  state.years = Number(elYears.value) || 30;
  state.extra = Number(elSliderExtra?.value) || 0;

  state.baseline = amortize(state.principal, state.rate, state.years);

  if (state.strategy === 'extra') {
    state.strategyResult = amortize(state.principal, state.rate, state.years, state.extra);
  } else if (state.strategy === 'fortnightly') {
    state.strategyResult = amortize(state.principal, state.rate, state.years, 0, true);
  } else if (state.strategy === 'refinance') {
    state.strategyResult = amortize(state.principal, state.newRate, state.years);
  } else {
    state.strategyResult = { ...state.baseline };
  }

  updateMetrics();
  updateHouseFromTimeline();
}

function updateMetrics() {
  const base = state.baseline;
  const strat = state.strategyResult;

  const ids = [
    ['dPayment', 'mmPayment', strat.effectiveMonthly],
    ['dInterest', 'mmInterest', strat.totalInterest],
    ['dTime', 'mmTime', strat.months],
  ];
  ids.forEach(([did, mid, val]) => {
    const d = document.getElementById(did);
    const m = document.getElementById(mid);
    const text = did === 'dTime' || did === 'mmTime' ? fmtYM(val) : fmt$(val);
    if (d) d.textContent = text;
    if (m) m.textContent = text;
  });

  const saved = base.totalInterest - strat.totalInterest;
  const timeSaved = base.months - strat.months;

  const dSaved = document.getElementById('dSaved');
  const mSaved = document.getElementById('mmSaved');
  if (dSaved) dSaved.textContent = fmt$(saved);
  if (mSaved) mSaved.textContent = fmt$(saved);

  const dTimeSaved = document.getElementById('dTimeSaved');
  const mTimeSaved = document.getElementById('mmTimeSaved');
  if (dTimeSaved) dTimeSaved.textContent = fmtYM(timeSaved);
  if (mTimeSaved) mTimeSaved.textContent = fmtYM(timeSaved);
}

function updateHouseFromTimeline() {
  const timelinePct = Number(elTimeline.value) / 100;
  const currentYear = timelinePct * state.years;
  const currentMonth = Math.round(currentYear * 12);

  const baseBal = balAt(state.baseline.schedule, currentMonth);
  const stratBal = balAt(state.strategyResult.schedule, currentMonth);

  const basePaid = Math.min(1, Math.max(0, (state.principal - baseBal) / state.principal));
  const stratPaid = Math.min(1, Math.max(0, (state.principal - stratBal) / state.principal));

  const baseH = basePaid * MAX_H;
  const stratH = stratPaid * MAX_H;

  baseClip.constant = baseH;
  stratClip.constant = stratH;

  baseScan.position.y = baseH;
  baseScanLine.position.y = baseH;
  baseScanLight.position.set(-12, baseH + 0.3, 0);

  stratScan.position.y = stratH;
  stratScanLine.position.y = stratH;
  stratScanLight.position.set(12, stratH + 0.3, 0);

  particles.visible = stratH > 0 && stratH < MAX_H;

  baseLight.intensity = Math.max(0, (basePaid - 0.85) / 0.15) * 2.5;
  stratLight.intensity = Math.max(0, (stratPaid - 0.85) / 0.15) * 2.5;

  const winInt = Math.max(0, (stratPaid - 0.88) / 0.12);
  strategyHouse.parts.forEach(p => {
    if (p.userData.name && p.userData.name.includes('Glass')) {
      p.material.emissive = new THREE.Color(0xffcc88);
      p.material.emissiveIntensity = winInt * 0.6;
    }
  });
  baselineHouse.parts.forEach(p => {
    if (p.userData.name && p.userData.name.includes('Glass')) {
      p.material.emissive = new THREE.Color(0xffcc88);
      p.material.emissiveIntensity = Math.max(0, (basePaid - 0.88) / 0.12) * 0.6;
    }
  });

  if (stratH > baseH + 0.3) {
    const midH = (baseH + stratH) / 2;
    gapBeam.position.set(0, midH, 0);
    gapBeam.scale.y = stratH - baseH;
    gapBeamMat.opacity = 0.3;
    gapPillarL.position.y = baseH + (stratH - baseH) / 2;
    gapPillarL.scale.y = stratH - baseH;
    gapPillarL.visible = true;
    gapPillarR.position.y = baseH + (stratH - baseH) / 2;
    gapPillarR.scale.y = stratH - baseH;
    gapPillarR.visible = true;

    const aheadYears = (stratPaid - basePaid) * state.years;
    elAheadLabel.textContent = `${aheadYears.toFixed(1)}y ahead`;
    gapLabel.textContent = `${aheadYears.toFixed(1)} years ahead`;
  } else {
    gapBeamMat.opacity = 0;
    gapPillarL.visible = false;
    gapPillarR.visible = false;
    elAheadLabel.textContent = '';
  }

  document.getElementById('hlBaseSub').textContent = `Year ${currentYear.toFixed(1)} — ${Math.round(basePaid * 100)}%`;
  document.getElementById('hlStratSub').textContent = `Year ${currentYear.toFixed(1)} — ${Math.round(stratPaid * 100)}%`;
  const stratLabelTitle = labelStrat.querySelector('.hl-title');
  if (state.strategy === 'extra') stratLabelTitle.textContent = `With extra ${fmt$(state.extra)}/mo`;
  else if (state.strategy === 'fortnightly') stratLabelTitle.textContent = 'With fortnightly payments';
  else if (state.strategy === 'refinance') stratLabelTitle.textContent = `With ${state.newRate}% rate`;
  else stratLabelTitle.textContent = 'With strategy';

  elYearLabel.textContent = `Year ${currentYear.toFixed(1)} of ${state.years}`;
  const phase = getPhase(stratH);
  elPhaseLabel.textContent = phase.name;

  updateMilestones(baseH, stratH);
}


// ==================== EVENT HANDLERS ====================

function showToast(msg) {
  elToast.textContent = msg;
  elToast.classList.add('show');
  setTimeout(() => elToast.classList.remove('show'), 2500);
}

function selectStrategy(strat) {
  if (COMING_SOON.includes(strat)) {
    showToast('Strategy coming in next update');
    return;
  }
  state.strategy = strat;

  elStrategyTiles.forEach(t => {
    t.classList.toggle('active', t.dataset.strategy === strat);
    t.classList.toggle('coming-soon', COMING_SOON.includes(t.dataset.strategy));
  });
  elMTiles.forEach(t => {
    t.classList.toggle('active', t.dataset.strategy === strat);
    t.classList.toggle('coming-soon', COMING_SOON.includes(t.dataset.strategy));
  });

  if (strat === 'extra') {
    elStrategyControl.innerHTML = `
      <label>Extra payment per month</label>
      <div class="slider-wrap">
        <input type="range" id="sliderExtra" min="0" max="5000" step="50" value="${state.extra}" />
        <span class="slider-val" id="valExtra">${fmt$(state.extra)}</span>
      </div>
    `;
    const ns = document.getElementById('sliderExtra');
    const nv = document.getElementById('valExtra');
    ns.addEventListener('input', () => { nv.textContent = fmt$(ns.value); state.extra = Number(ns.value); updateCalculations(); });
  } else if (strat === 'fortnightly') {
    elStrategyControl.innerHTML = `
      <label>Fortnightly payments</label>
      <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;line-height:1.5;">
        Pay half your monthly amount every 2 weeks.<br>26 payments/year = 13 monthly equivalents.
      </div>
    `;
  } else if (strat === 'refinance') {
    elStrategyControl.innerHTML = `
      <label>New interest rate (%)</label>
      <div class="slider-wrap">
        <input type="number" id="inputNewRate" value="${state.newRate}" step="0.05" style="width:100px;padding:6px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#e2e8f0;font-size:0.9rem;" />
      </div>
    `;
    document.getElementById('inputNewRate').addEventListener('input', (e) => { state.newRate = Number(e.target.value); updateCalculations(); });
  } else if (strat === 'roundup') {
    elStrategyControl.innerHTML = `
      <label>Round up payments</label>
      <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;line-height:1.5;">
        Example: $3,247 → $3,300. The extra $53 goes to principal.<br>
        Average round-up: ~$30–$80/month.
      </div>
    `;
  } else if (strat === 'offset') {
    elStrategyControl.innerHTML = `
      <label>Offset account balance</label>
      <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;line-height:1.5;">
        Every dollar in offset reduces interest charged daily.<br>
        $50,000 in offset on $600K loan = pays like $550K.
      </div>
    `;
  } else if (strat === 'negotiate') {
    elStrategyControl.innerHTML = `
      <label>Rate negotiation</label>
      <div style="font-size:0.8rem;color:#94a3b8;margin-top:4px;line-height:1.5;">
        Call your bank annually. Ask for their "new customer rate."<br>
        Typical discount: 0.1%–0.3% off advertised rate.
      </div>
    `;
  }

  updateCalculations();
}

elStrategyTiles.forEach(t => t.addEventListener('click', () => selectStrategy(t.dataset.strategy)));
elMTiles.forEach(t => t.addEventListener('click', () => selectStrategy(t.dataset.strategy)));

elPrincipal.addEventListener('input', updateCalculations);
elRate.addEventListener('input', updateCalculations);
elYears.addEventListener('input', updateCalculations);

if (elSliderExtra) {
  elSliderExtra.addEventListener('input', () => {
    elValExtra.textContent = fmt$(elSliderExtra.value);
    updateCalculations();
  });
}

elTimeline.addEventListener('input', () => {
  state.isPlaying = false;
  elPlayBtn.textContent = '▶';
  updateHouseFromTimeline();
});

elPlayBtn.addEventListener('click', () => {
  if (state.isPlaying) {
    state.isPlaying = false;
    elPlayBtn.textContent = '▶';
  } else {
    state.isPlaying = true;
    state.playStart = performance.now();
    elPlayBtn.textContent = '⏸';
    if (Number(elTimeline.value) >= 100) elTimeline.value = 0;
  }
});

let sheetExpanded = false;
if (elSheetHandle) {
  elSheetHandle.addEventListener('click', () => {
    sheetExpanded = !sheetExpanded;
    elBottomSheet.classList.toggle('expanded', sheetExpanded);
  });
}

if (elMobileMetricsToggle) {
  elMobileMetricsToggle.addEventListener('click', () => {
    elMobileMetricsPanel.classList.toggle('open');
  });
}
if (elCloseMobileMetrics) {
  elCloseMobileMetrics.addEventListener('click', () => {
    elMobileMetricsPanel.classList.remove('open');
  });
}

// ==================== ANIMATION LOOP ====================

function animateParticles(buildY) {
  if (!particles.visible) return;
  const pos = particles.geometry.attributes.position.array;
  for (let i = 0; i < PC; i++) {
    let y = pos[i * 3 + 1];
    y += pVel[i].y;
    if (y > buildY + 1.2 || Math.random() < 0.012) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = buildY + Math.random() * 0.15;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    } else {
      pos[i * 3 + 1] = y;
      pos[i * 3] += pVel[i].x;
      pos[i * 3 + 2] += pVel[i].z;
    }
  }
  particles.geometry.attributes.position.needsUpdate = true;
}

function updatePlay() {
  if (!state.isPlaying) return;
  const elapsed = performance.now() - state.playStart;
  const t = Math.min(elapsed / state.playDuration, 1);
  const eased = 1 - Math.pow(1 - t, 3);
  elTimeline.value = eased * 100;
  updateHouseFromTimeline();
  if (t >= 1) {
    state.isPlaying = false;
    elPlayBtn.textContent = '▶';
  }
}

function render() {
  requestAnimationFrame(render);
  controls.update();
  updatePlay();
  animateParticles(stratClip.constant);
  updateLabels();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ==================== INIT ====================

function init() {
  updateCalculations();
  updateHouseFromTimeline();

  elStrategyTiles.forEach(t => {
    if (COMING_SOON.includes(t.dataset.strategy)) t.classList.add('coming-soon');
  });
  elMTiles.forEach(t => {
    if (COMING_SOON.includes(t.dataset.strategy)) t.classList.add('coming-soon');
  });

  setTimeout(() => {
    elLoader.classList.add('hidden');
    setTimeout(() => elLoader.remove(), 600);
  }, 1500);

  render();
}

init();
