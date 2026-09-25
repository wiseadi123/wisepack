// Progressive enhancement: the form and the dimension summary never depend on WebGL.
const stage = document.getElementById('batteryStage');
const controls = document.querySelectorAll('.preview-controls button, #toggleDimensions');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let preview;
let loading = false;
let dimensions = readDimensions();

function readDimensions() {
  return Object.fromEntries(['length', 'width', 'height'].map(key => [key, Number(document.getElementById(`${key}Input`).value)]));
}

function fallback() {
  stage.dataset.state = 'fallback';
  stage.querySelector('.battery-fallback span').textContent = 'תצוגה פשוטה · המידות והטופס זמינים כרגיל';
  controls.forEach(button => { button.disabled = true; });
  document.getElementById('batteryLabels').hidden = true;
}

document.addEventListener('battery-dimensions', event => {
  dimensions = event.detail;
  preview?.setDimensions(dimensions);
});

async function loadPreview() {
  if (loading) return;
  loading = true;
  try {
    const [THREE, { RoundedBoxGeometry }, { RoomEnvironment }] = await Promise.all([
      import('./vendor/three/three.module.js'),
      import('./vendor/three/RoundedBoxGeometry.js'),
      import('./vendor/three/RoomEnvironment.js')
    ]);
    preview = createPreview(THREE, RoundedBoxGeometry, RoomEnvironment);
    preview.setDimensions(dimensions);
    stage.dataset.state = 'ready';
  } catch (error) {
    console.warn('Battery preview unavailable; using the accessible fallback.', error.message);
    fallback();
  }
}

if ('IntersectionObserver' in window) {
  const loader = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { loader.disconnect(); loadPreview(); }
  }, { rootMargin: '250px' });
  loader.observe(stage);
} else loadPreview();

function createPreview(T, RoundedBoxGeometry, RoomEnvironment) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  stage.prepend(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, 0.01, 150);
  const environment = new RoomEnvironment();
  const pmrem = new T.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.9;
  environment.dispose();
  pmrem.dispose();
  scene.add(new T.HemisphereLight(0xd5efff, 0x14212b, 2.1));
  const key = new T.DirectionalLight(0xf3f7ff, 3.5);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const rim = new T.DirectionalLight(0x8bdedb, 2.2);
  rim.position.set(4, 2, -3);
  scene.add(rim);
  const fill = new T.DirectionalLight(0xabc5e7, 1.2);
  fill.position.set(3, 0, 4);
  scene.add(fill);

  const textures = [];
  function canvasTexture(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    textures.push(texture);
    return texture;
  }
  const logo = canvasTexture(1024, 384, (ctx, w, h) => {
    ctx.textAlign = 'center'; ctx.fillStyle = '#edf3f8';
    ctx.font = '600 110px Arial, sans-serif';
    ctx.fillText('WISEPACK', w / 2, 173);
    ctx.fillStyle = '#62d9c9'; ctx.fillRect(w / 2 - 31, 223, 62, 7);
  });
  const poleTexture = sign => canvasTexture(64, 64, ctx => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(18, 32); ctx.lineTo(46, 32);
    if (sign === '+') { ctx.moveTo(32, 18); ctx.lineTo(32, 46); }
    ctx.stroke();
  });
  const plus = poleTexture('+'), minus = poleTexture('-');
  const shadowTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 3, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.68)');
    gradient.addColorStop(.4, 'rgba(0,0,0,.35)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  });
  const materials = {
    body: new T.MeshStandardMaterial({ color: 0x303b46, metalness: .68, roughness: .38 }),
    cap: new T.MeshStandardMaterial({ color: 0x8493a3, metalness: .78, roughness: .27 }),
    dark: new T.MeshStandardMaterial({ color: 0x141c23, metalness: .15, roughness: .62 }),
    seam: new T.MeshStandardMaterial({ color: 0x40cfbe, metalness: .55, roughness: .3, emissive: 0x12332f, emissiveIntensity: .35 }),
    red: new T.MeshStandardMaterial({ color: 0xe6534f, metalness: .1, roughness: .34 }),
    black: new T.MeshStandardMaterial({ color: 0x202832, metalness: .12, roughness: .4 }),
    metal: new T.MeshStandardMaterial({ color: 0xcbd3dc, metalness: .95, roughness: .22 }),
    groove: new T.MeshStandardMaterial({ color: 0x202a34, metalness: .55, roughness: .46 }),
    logo: new T.MeshBasicMaterial({ map: logo, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
    plus: new T.MeshBasicMaterial({ map: plus, transparent: true, depthWrite: false }),
    minus: new T.MeshBasicMaterial({ map: minus, transparent: true, depthWrite: false }),
    measure: new T.LineBasicMaterial({ color: 0x83e5d8, transparent: true, opacity: .7, depthTest: false })
  };
  const shadowMaterial = new T.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new T.Mesh(new T.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  let model = new T.Group(), measurement = new T.Group();
  scene.add(model, measurement);
  let width = 1, height = 1.2, length = 2.5;
  let radius = 1.6;
  let labels = [];
  let showDimensions = true;
  let frame = 0, visible = true, disposed = false, lost = false;
  let lastTime = 0;
  const home = { theta: .62, phi: 1.07, zoom: 1 };
  const view = { ...home }, target = { ...home };
  const labelLayer = document.getElementById('batteryLabels');
  const viewButtons = ['resetView', 'frontView', 'sideView', 'topView'];
  const cleanups = [];
  function listen(element, name, handler, options) {
    element.addEventListener(name, handler, options);
    cleanups.push(() => element.removeEventListener(name, handler, options));
  }
  function rounded(x, y, z, bevel, material, px = 0, py = 0, pz = 0) {
    const mesh = new T.Mesh(new RoundedBoxGeometry(x, y, z, 3, Math.min(bevel, x / 3, y / 3, z / 3)), material);
    mesh.position.set(px, py, pz); model.add(mesh); return mesh;
  }
  function plane(x, y, material, px, py, pz, rotation = 0) {
    const mesh = new T.Mesh(new T.PlaneGeometry(x, y), material);
    mesh.position.set(px, py, pz); mesh.rotation.y = rotation; model.add(mesh); return mesh;
  }
  function cylinder(r, h, material, x, y, z) {
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 32), material);
    mesh.position.set(x, y, z); model.add(mesh); return mesh;
  }
  function empty(group) {
    group.traverse(child => child.geometry?.dispose());
    group.clear();
  }
  function addDimension(a, b, offset, text) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), delta = new T.Vector3(...offset);
    const outerStart = start.clone().add(delta), outerEnd = end.clone().add(delta);
    const tick = delta.clone().normalize().multiplyScalar(radius * .025);
    const points = [start, outerStart.clone().add(tick), end, outerEnd.clone().add(tick), outerStart, outerEnd,
      outerStart.clone().sub(tick), outerStart.clone().add(tick), outerEnd.clone().sub(tick), outerEnd.clone().add(tick)];
    measurement.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(points), materials.measure));
    const element = document.createElement('span');
    element.className = 'battery-dimension'; element.textContent = text;
    labelLayer.append(element);
    labels.push({ element, point: outerStart.clone().lerp(outerEnd, .5).add(tick.clone().multiplyScalar(2)) });
  }
  function setDimensions(values) {
    if (!Object.values(values).every(value => Number.isFinite(value) && value > 0)) return;
    ({ width, height, length } = { width: values.width / 10, height: values.height / 10, length: values.length / 10 });
    empty(model); empty(measurement); labelLayer.replaceChildren(); labels = [];
    const bevel = Math.min(.055, width * .065, length * .065, height * .065);
    const lid = Math.min(.075, height * .09);
    const foot = Math.min(.06, height * .07);
    const top = height / 2;
    radius = Math.hypot(width, height + .25, length) / 2;
    rounded(width, height - lid - foot, length, bevel, materials.body, 0, (foot - lid) / 2);
    rounded(width * 1.012, foot, length * 1.006, bevel / 2, materials.dark, 0, -top + foot / 2);
    rounded(width * 1.008, .016, length * 1.004, .007, materials.seam, 0, top - lid - .004);
    rounded(width * 1.02, lid, length * 1.01, bevel / 1.7, materials.cap, 0, top - lid / 2 + .008);
    // Subtle recessed ribs on the two long panels, with a clear logo area above.
    const ribs = Math.max(3, Math.min(26, Math.floor(length / .08)));
    for (const sign of [-1, 1]) {
      for (let i = 0; i < ribs; i++) {
        const groove = new T.Mesh(new T.BoxGeometry(.004, height * .23, .012), materials.groove);
        groove.position.set(sign * (width / 2 + .001), -height * .23, (i / (ribs - 1) - .5) * (length - bevel * 5));
        model.add(groove);
      }
    }
    const brandWidth = Math.min(length * .75, height * 1.65);
    plane(brandWidth, brandWidth * .375, materials.logo, width / 2 + .003, height * .1, 0, Math.PI / 2);
    const frontBrand = Math.min(width * .81, height * 1.6);
    plane(frontBrand, frontBrand * .375, materials.logo, 0, height * .08, length / 2 + .003);
    const poleRadius = Math.min(.077, width * .13, length * .1);
    for (const [x, material, marking] of [[-width * .24, materials.black, materials.minus], [width * .24, materials.red, materials.plus]]) {
      const z = -length * .12;
      cylinder(poleRadius * 1.24, .025, materials.dark, x, top + .024, z);
      cylinder(poleRadius, .085, material, x, top + .067, z);
      cylinder(poleRadius * .56, .038, materials.metal, x, top + .128, z);
      const mark = plane(poleRadius * 1.3, poleRadius * 1.3, marking, x, top + .017, z + poleRadius * 2.2);
      mark.rotation.x = -Math.PI / 2;
    }
    shadow.position.y = -top - .025;
    shadow.scale.set(width * 2.05 + .3, length * 1.6 + .3, 1);
    const gap = radius * .17;
    addDimension([-width / 2, -top, length / 2], [width / 2, -top, length / 2], [0, -gap, gap * .3], `רוחב ${values.width} ס״מ`);
    addDimension([width / 2, -top, -length / 2], [width / 2, -top, length / 2], [gap, -gap, 0], `אורך ${values.length} ס״מ`);
    addDimension([-width / 2, -top, length / 2], [-width / 2, top, length / 2], [-gap, 0, gap * .4], `גובה ${values.height} ס״מ`);
    measurement.visible = showDimensions;
    stage.setAttribute('aria-label', `תצוגה תלת־ממדית: אורך ${values.length}, רוחב ${values.width}, גובה ${values.height} סנטימטר`);
    requestRender();
  }
  function selectView(id) {
    viewButtons.forEach(button => document.getElementById(button).setAttribute('aria-pressed', String(button === id)));
  }
  function requestRender() {
    if (!frame && visible && !document.hidden && !disposed && !lost) frame = requestAnimationFrame(render);
  }
  function render(time) {
    frame = 0;
    const dt = Math.min((time - lastTime) / 1000 || .016, .05);
    lastTime = time;
    const ease = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 15);
    let moving = false;
    for (const name of ['theta', 'phi', 'zoom']) {
      view[name] += (target[name] - view[name]) * ease;
      if (Math.abs(target[name] - view[name]) > .0002) moving = true;
      else view[name] = target[name];
    }
    const verticalFov = T.MathUtils.degToRad(camera.fov);
    const narrowFov = Math.min(verticalFov, 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect));
    const distance = radius / Math.sin(narrowFov / 2) * (showDimensions ? 1.27 : 1.1) / view.zoom;
    camera.position.set(distance * Math.sin(view.phi) * Math.sin(view.theta), distance * Math.cos(view.phi), distance * Math.sin(view.phi) * Math.cos(view.theta));
    camera.lookAt(0, .025, 0);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    if (showDimensions) {
      const w = stage.clientWidth, h = stage.clientHeight;
      for (const { element, point } of labels) {
        const p = point.clone().project(camera);
        const x = Math.max(element.offsetWidth / 2 + 4, Math.min(w - element.offsetWidth / 2 - 4, (p.x + 1) / 2 * w));
        const y = Math.max(13, Math.min(h - 13, (1 - p.y) / 2 * h));
        element.style.left = `${x}px`; element.style.top = `${y}px`;
        element.style.visibility = p.z > 1 ? 'hidden' : 'visible';
      }
    }
    if (moving) requestRender();
  }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage); resize();
  const visibilityObserver = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) requestRender();
    else { cancelAnimationFrame(frame); frame = 0; }
  });
  visibilityObserver.observe(stage);
  listen(document, 'visibilitychange', () => {
    if (!document.hidden) requestRender();
    else { cancelAnimationFrame(frame); frame = 0; }
  });
  listen(reducedMotion, 'change', requestRender);
  function zoomBy(amount) {
    target.zoom = T.MathUtils.clamp(target.zoom + amount, .72, 1.22);
    document.getElementById('zoomIn').disabled = target.zoom >= 1.22;
    document.getElementById('zoomOut').disabled = target.zoom <= .72;
    requestRender();
  }
  for (const [id, theta, phi] of [['resetView', home.theta, home.phi], ['frontView', 0, Math.PI / 2], ['sideView', Math.PI / 2, Math.PI / 2], ['topView', 0, .001]]) {
    listen(document.getElementById(id), 'click', () => {
      const turns = Math.round(target.theta / (Math.PI * 2));
      target.theta = theta + turns * Math.PI * 2; target.phi = phi;
      if (id === 'resetView') target.zoom = 1;
      zoomBy(0); selectView(id); requestRender();
    });
  }
  listen(document.getElementById('zoomIn'), 'click', () => zoomBy(.1));
  listen(document.getElementById('zoomOut'), 'click', () => zoomBy(-.1));
  listen(document.getElementById('toggleDimensions'), 'click', event => {
    showDimensions = !showDimensions;
    event.currentTarget.setAttribute('aria-pressed', String(showDimensions));
    event.currentTarget.querySelector('span').textContent = showDimensions ? 'הסתרת מידות' : 'הצגת מידות';
    labelLayer.hidden = !showDimensions; measurement.visible = showDimensions; requestRender();
  });
  listen(stage, 'keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { document.getElementById('resetView').click(); return; }
    if (['+', '=', '-'].includes(event.key)) { zoomBy(event.key === '-' ? -.1 : .1); return; }
    target.theta += event.key === 'ArrowLeft' ? -.18 : event.key === 'ArrowRight' ? .18 : 0;
    target.phi = T.MathUtils.clamp(target.phi + (event.key === 'ArrowUp' ? -.15 : event.key === 'ArrowDown' ? .15 : 0), .001, Math.PI - .12);
    selectView(null); requestRender();
  });
  const pointers = new Map();
  let pinchDistance = 0;
  const separation = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  listen(stage, 'pointerdown', event => {
    if (event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    if (pointers.size === 2) pinchDistance = separation();
  });
  listen(stage, 'pointermove', event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, current);
    if (pointers.size === 2) {
      const next = separation();
      zoomBy((next - pinchDistance) * .003); pinchDistance = next;
    } else {
      target.theta -= (current.x - previous.x) * .009;
      // Preserve native vertical scrolling for one-finger gestures on mobile.
      if (event.pointerType !== 'touch') target.phi = T.MathUtils.clamp(target.phi - (current.y - previous.y) * .007, .001, Math.PI - .12);
      selectView(null); requestRender();
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(stage, name, event => pointers.delete(event.pointerId));
  listen(renderer.domElement, 'webglcontextlost', event => {
    event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; fallback();
  });
  listen(renderer.domElement, 'webglcontextrestored', () => {
    lost = false; stage.dataset.state = 'ready'; controls.forEach(button => { button.disabled = false; });
    labelLayer.hidden = !showDimensions; zoomBy(0); requestRender();
  });
  listen(window, 'pagehide', event => {
    if (event.persisted) return;
    disposed = true; cancelAnimationFrame(frame);
    resizeObserver.disconnect(); visibilityObserver.disconnect();
    cleanups.forEach(cleanup => cleanup());
    empty(model); empty(measurement); shadow.geometry.dispose(); shadowMaterial.dispose();
    Object.values(materials).forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose()); envTarget.dispose(); renderer.dispose();
  });
  return { setDimensions };
}
