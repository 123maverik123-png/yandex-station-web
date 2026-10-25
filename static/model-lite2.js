
import * as THREE from 'three';
import { STLLoader } from './vendor/three/STLLoader.js';
import { OrbitControls } from './vendor/three/OrbitControls.js';
import { toCreasedNormals } from './vendor/three/BufferGeometryUtils.js';
import { makeWeave } from './model-fabric.js';

// Цвета корпусов (yandex-getcolor) — на глаз по фото.
const BODY_COLORS = { copper: '#a8603e', black: '#2c2c31', blue: '#3e5f90', green: '#56715f', pink: '#d8a4a9', violet: '#6e5b98' };
// Дисплей светится сквозь ткань на лицевой стороне (−Y в STL; сзади выемка под разъём).
// В модели окна под него нет, поэтому положение задано вручную, в мм в координатах STL.
const DISPLAY = { centerZ: -29, arcWidth: 46, radius: 45.55 };
const MODEL_TOP = 0, MODEL_BOTTOM = -61.2, LIFT = -(MODEL_TOP + MODEL_BOTTOM) / 2;
// В центре верха — кольцо из полупрозрачного пластика (отдельная деталь в STL, r≈3,4–5,9 мм), под ним
// 3 RGB-светодиода. Центр внутри кольца — непрозрачный корпус. Радиусы берутся из самой модели.
const START_ANGLE = -0.5;   // модель изначально повёрнута, чтобы был виден объём

const view = document.getElementById('model-view');
view.classList.add('studio-view');
view.setAttribute('role','group');
view.setAttribute('aria-label','3D-модель: вращайте мышью или пальцем');
view.insertAdjacentHTML('beforeend','<div class="studio-tools"><button id="studio-home" type="button" aria-label="Исходный ракурс">↺</button><button id="studio-spin" type="button" aria-label="Автовращение" aria-pressed="false">⟳</button><select id="studio-color" aria-label="Цвет корпуса"></select></div><div class="studio-caption">Вращайте · приближайте</div><a class="studio-source" href="' + new URL('./models/SOURCES.md',import.meta.url).href + '" target="_blank">О модели</a>');
let manualColor=localStorage.getItem('model-color-lite2');
let deviceColor=window.__deviceColor||'copper';
const picker=document.getElementById('studio-color');
picker.add(new Option('Как у колонки','auto'));
for(const [key,label]of Object.entries({copper:'Оранжевый',black:'Чёрный',blue:'Синий',green:'Зелёный',pink:'Розовый',violet:'Фиолетовый'}))picker.add(new Option(label,key));
picker.value=manualColor||'auto';
picker.addEventListener('change',()=>{manualColor=picker.value==='auto'?null:picker.value;if(manualColor)localStorage.setItem('model-color-lite2',manualColor);else localStorage.removeItem('model-color-lite2');paint(manualColor||deviceColor);});
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch {
  view.hidden = true;   // без WebGL блок просто не показываем
  throw new Error('no webgl');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.domElement.className='studio-canvas';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 1, 2000);
camera.position.set(0, 69, 239);   // модель ~на 10 % меньше — визуализатору больше места
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 130;
controls.maxDistance = 450;
controls.target.set(0, 0, 0);
document.getElementById('studio-home').addEventListener('click',()=>{camera.position.set(0,69,239);controls.target.set(0,0,0);controls.update();});
document.getElementById('studio-spin').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.setAttribute('aria-pressed',String(controls.autoRotate));});
controls.autoRotateSpeed=.7;

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a48, 1.6));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(140, 220, 180);
scene.add(key);
key.castShadow=true;key.shadow.mapSize.set(1024,1024);
Object.assign(key.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:650});
key.shadow.normalBias=.12;
const rim = new THREE.DirectionalLight(0xffeedd, 1.0);
rim.position.set(-180, 60, -160);
scene.add(rim);

const group = new THREE.Group();
scene.add(group);

// ---- корпус ----
const weave=makeWeave(THREE);
weave.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
const bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, bumpMap:weave,bumpScale:.17,sheen:.35,sheenRoughness:.9 });
// Only the fabric part gets yarn colour/normal variation; top plastic remains smooth.
bodyMat.onBeforeCompile=shader=>{
  shader.uniforms.fabricWeave={value:weave};
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float fabricMask;varying float vFabric;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFabric=fabricMask;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D fabricWeave;varying float vFabric;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=mix(1.0,.7+.3*texture2D(fabricWeave,vBumpMapUv).r,vFabric);').replace('#include <normal_fragment_maps>','vec3 untexturedNormal=normal;\n#include <normal_fragment_maps>\nnormal=normalize(mix(untexturedNormal,normal,vFabric));');
};
let bodyGeom = null, partOf = null;  // partOf[i]: 0 — корпус, 1 — пластиковый диск сверху, 2 — тёмные детали
function paint(colorKey) {
  if (!bodyGeom) return;
  const body = new THREE.Color(BODY_COLORS[colorKey] || BODY_COLORS.black);
  const plastic = body.clone().lerp(new THREE.Color('#dedad6'), 0.55);   // матовый полупрозрачный пластик
  const dark = new THREE.Color('#1b1b1f');
  const col = bodyGeom.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, ...[body, plastic, dark][partOf[i]].toArray());
  col.needsUpdate = true;
  // Холст показываем, когда известен настоящий цвет, — чтобы не мелькала чёрная колонка.
  if (colorKey) renderer.domElement.style.opacity = 1;
}
window.modelColor = c => {deviceColor=c;if(!manualColor)paint(c);};

new STLLoader().load(new URL('../model.stl',import.meta.url).href, geom => {
  // Группы граней по цвету из STL: самая частая — корпус, самая светлая из остальных — кнопка, прочее — разъёмы.
  const src = geom.attributes.color;
  const n = geom.attributes.position.count;
  partOf = new Uint8Array(n);
  if (src) {
    const key = i => `${src.getX(i).toFixed(3)},${src.getY(i).toFixed(3)},${src.getZ(i).toFixed(3)}`;
    const counts = new Map();
    for (let i = 0; i < n; i++) counts.set(key(i), (counts.get(key(i)) || 0) + 1);
    const sorted = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const lum = k => k.split(',').reduce((s, x) => s + +x, 0);
    const brightest = sorted.slice(1).sort((a, b) => lum(b) - lum(a))[0];
    for (let i = 0; i < n; i++) { const k = key(i); partOf[i] = k === sorted[0] ? 0 : k === brightest ? 1 : 2; }
  }
  geom.rotateX(-Math.PI / 2);   // STL — Z вверх, three.js — Y вверх; лицевая сторона (−Y в STL) смотрит в камеру (+Z)
  geom.translate(0, LIFT, 0);    // центр по высоте — в начало координат
  // STL неиндексированный: функция пересчитывает нормали на месте, порядок вершин не меняется.
  bodyGeom = toCreasedNormals(geom, THREE.MathUtils.degToRad(35));
  const positions=bodyGeom.attributes.position,uv=new Float32Array(n*2),mask=new Float32Array(n);
  for(let i=0;i<n;i++){uv[i*2]=Math.atan2(positions.getX(i),positions.getZ(i))/(Math.PI*2)+.5;uv[i*2+1]=(positions.getY(i)+LIFT)/61.2;mask[i]=partOf[i]===0?1:0;}
  bodyGeom.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  bodyGeom.setAttribute('fabricMask',new THREE.BufferAttribute(mask,1));
  // границы полупрозрачного кольца — по вершинам этой детали
  let rin = Infinity, rout = 0;
  const pos = bodyGeom.attributes.position;
  for (let i = 0; i < n; i++) if (partOf[i] === 1) {
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    rin = Math.min(rin, r); rout = Math.max(rout, r);
  }
  if (rout > 0) buildRing(rin, rout, n);
  if (!bodyGeom.attributes.color) bodyGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const body=new THREE.Mesh(bodyGeom, bodyMat);body.castShadow=body.receiveShadow=true;group.add(body);
  renderer.domElement.style.cssText = 'opacity:0;transition:opacity .4s';
  view.appendChild(renderer.domElement);
  paint(manualColor||deviceColor);
  view.dataset.model='lite2';view.dataset.renderer='webgl';
  view.dispatchEvent(new Event('modelready'));
  resize();
}, undefined, () => { view.hidden = true; });

// ---- дисплей ----
const G = window.clockGeom;
const canvas = document.createElement('canvas');
canvas.width = 1020; canvas.height = 336;   // viewBox предпросмотра 340×112, ×3
const ctx = canvas.getContext('2d');
const tex = new THREE.CanvasTexture(canvas);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = 4;
const arc = DISPLAY.arcWidth / DISPLAY.radius;
const height = DISPLAY.arcWidth * canvas.height / canvas.width;
const screen = new THREE.Mesh(
  new THREE.CylinderGeometry(DISPLAY.radius, DISPLAY.radius, height, 48, 1, true, -arc / 2, arc),
  new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
screen.position.y = DISPLAY.centerZ + LIFT;
group.add(screen);

function drawDisplay(v) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(3, 0, 0, 3, 12, 12);   // как viewBox="-4 -4 340 112"
  const glow = (a, draw) => {
    if (a <= 0) return;
    ctx.globalAlpha = Math.max(0.18, a / 255);
    ctx.shadowColor = 'rgba(255,244,230,0.9)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = ctx.strokeStyle = '#fff6ea';
    draw();
  };
  G.DIGIT_X.forEach((x, p) => {
    for (const [seg, d] of G.segShapes(x)) glow(v[p * 8 + G.SEGS.indexOf(seg)], () => ctx.fill(new Path2D(d)));
    glow(v[p * 8 + 7], () => { ctx.beginPath(); ctx.arc(x + 28, 36, 4.5, 0, 7); ctx.fill(); });
  });
  [[G.X_DH, 30], [G.X_DL, 66]].forEach(([i, y]) =>
    glow(v[i], () => { ctx.beginPath(); ctx.arc(146, y, 6, 0, 7); ctx.fill(); }));
  glow(v[G.X_DM], () => ctx.fillRect(137, 45, 18, 6));   // дефис
  glow(v[G.X_DEG], () => { ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(318, 10, 7, 0, 7); ctx.stroke(); });
  ctx.globalAlpha = 1;
  tex.needsUpdate = true;
}
let lastKey = '';
window.modelShow = v => {
  const k = v.join(',');
  if (k === lastKey) return;
  lastKey = k;
  drawDisplay(v);
};
drawDisplay(new Array(36).fill(0));

// ---- кольцо ----
// Свечение сквозь пластик: заполняет ровно полупрозрачную деталь, ярче к её середине; по окружности
// цвет плавно переходит между тремя светодиодами (под углами 90°, 210°, 330°). Не аддитивно, а
// «подкрашиванием» через альфу: на светлом пластике сложение выжигает цвет в белый.
// В STL пластиковая деталь лежит на −0,01 мм, а грань корпуса над всем верхом — на +0,01: они почти
// совпадают, и видеокарта рисует то одно, то другое. Поэтому деталь (вместе с её формой — это логотип)
// приподнимаем над корпусом, а свечение строим из её же треугольников ещё чуть выше.
let ringGeom = null, ringIn = 0, ringOut = 0, ringLeds = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
function buildRing(inner, outer, n) {
  ringIn = inner; ringOut = outer;
  const pos = bodyGeom.attributes.position;
  const pts = [];
  for (let i = 0; i < n; i++) if (partOf[i] === 1) {
    pos.setY(i, pos.getY(i) + 0.05);
    pts.push(pos.getX(i), pos.getY(i) + 0.04, pos.getZ(i));
  }
  pos.needsUpdate = true;
  ringGeom = new THREE.BufferGeometry();
  ringGeom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  ringGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pts.length / 3 * 4), 4));
  group.add(new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })));
  paintRing(ringLeds);
}
const tmp = new THREE.Color();
const LED_ANGLES = [90, 210, 330].map(a => THREE.MathUtils.degToRad(a));
function paintRing(leds) {
  ringLeds = leds;
  if (!ringGeom) return;
  const pos = ringGeom.attributes.position, col = ringGeom.attributes.color;
  const mid = (ringIn + ringOut) / 2, half = (ringOut - ringIn) / 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ang = Math.atan2(-z, x);
    let r = 0, g = 0, b = 0, ws = 0;
    LED_ANGLES.forEach((a, k) => {
      const d = Math.abs(Math.atan2(Math.sin(ang - a), Math.cos(ang - a)));
      const w = Math.max(0, 1 - d / (2 * Math.PI / 3)) ** 1.5;
      r += leds[k][0] * w; g += leds[k][1] * w; b += leds[k][2] * w; ws += w;
    });
    r /= ws || 1; g /= ws || 1; b /= ws || 1;
    const top = Math.max(r, g, b);
    if (top <= 0) { col.setXYZW(i, 0, 0, 0, 0); continue; }
    // Оттенок — по наблюдениям за живой колонкой: рядом с синим красный почти не виден (#6b0fff —
    // синий, а не фиолетовый), а зелёный, наоборот, яркий (#ffab02 — оранжевый, #ffec02 — жёлтый).
    // Поэтому степени по каналам разные. Свет идёт сквозь белый пластик — подмешиваем белый.
    const W = 0.22;
    const ch = (v, p) => W + (1 - W) * (v / top) ** p;
    tmp.setRGB(ch(r, 2), ch(g, 0.8), ch(b, 1.5), THREE.SRGBColorSpace);
    // Яркость — через непрозрачность. Светодиоды часто горят на 10–25 %, поэтому корень, чтобы слабое
    // свечение было видно; потолок 0,85 — пластик остаётся пластиком, а не сплошной краской.
    const k = 0.6 + 0.4 * Math.cos(Math.min(1, Math.abs(Math.hypot(x, z) - mid) / half) * Math.PI / 2);
    col.setXYZW(i, tmp.r, tmp.g, tmp.b, Math.min(0.85, Math.sqrt(top / 255) * k));
  }
  col.needsUpdate = true;
}
let lastRing = '';
window.modelRing = leds => {
  const k = JSON.stringify(leds);
  if (k === lastRing) return;
  lastRing = k;
  paintRing(leds);
};
window.modelRing([[0, 0, 0], [0, 0, 0], [0, 0, 0]]);

// ---- размер и отрисовка ----
function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
group.rotation.y = START_ANGLE;
const floor=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.ShadowMaterial({color:'#101018',opacity:.18}));
floor.rotation.x=-Math.PI/2;floor.position.y=-LIFT-.2;floor.receiveShadow=true;scene.add(floor);
let previous=0;
renderer.setAnimationLoop(now => {
  if (document.hidden || !view.offsetParent) return;   // вкладка не видна — не греем GPU
  if(now-previous<33)return;previous=now;
  controls.update();
  renderer.render(scene, camera);
});
