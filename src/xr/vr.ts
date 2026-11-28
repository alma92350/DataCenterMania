import * as THREE from 'three';
import type { Command } from '../sim/commands';
import type { GameState } from '../sim/types';
import {
  buildScene, dispatchCommand, dispatchTarget, hallOffset, PANEL, PANEL_BUTTONS, panelHit, panelText, panelUv, pickRack, RACK_SIZE, type PanelAction, type SceneModel,
} from './model';

/** What the immersive view needs from the running game. */
export interface VrApi {
  state(): GameState | null;
  speed(): number;
  setSpeed(n: number): void;
  /** Advances the game exactly as a normal animation frame would. */
  tick(t: number): void;
  run(cmd: Command): boolean;
}

export { vrSupported } from './support';

const SEV_COLOR = ['#000000', '#ffb020', '#ff7a1a', '#ff3b5c'];

/**
 * Enters the immersive hall (v4.1): the data center as a room around the player, a laser pointer on each
 * controller, and a floating panel. Written to the WebXR and three.js APIs; needs a real headset to be proven.
 */
export async function enterVr(api: VrApi): Promise<void> {
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  if (!xr) throw new Error('WebXR is not available in this browser.');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  const session = await xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  await renderer.xr.setSession(session);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b0f15');
  scene.add(new THREE.HemisphereLight('#bcd4ff', '#1a2230', 1.1));
  const sun = new THREE.DirectionalLight('#ffffff', 0.8);
  sun.position.set(2, 6, 3);
  scene.add(sun);

  const hall = new THREE.Group();
  scene.add(hall);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 1), new THREE.MeshStandardMaterial({ color: '#1c2430' }));
  floor.position.y = -0.025;
  hall.add(floor);
  const rackMeshes = new Map<string, THREE.Mesh>();
  const beacons = new Map<string, THREE.Mesh>();
  const coolerMeshes = new Map<string, THREE.Mesh>();
  const techMeshes = new Map<string, THREE.Mesh>();
  const rackGeo = new THREE.BoxGeometry(RACK_SIZE.w, RACK_SIZE.h, RACK_SIZE.d);
  const beaconGeo = new THREE.SphereGeometry(0.14, 12, 12);
  const coolerGeo = new THREE.BoxGeometry(0.9, 0.7, 0.4);
  const techGeo = new THREE.CylinderGeometry(0.16, 0.16, 1.6, 10);

  // the floating panel: a canvas texture on a quad
  const canvas = document.createElement('canvas');
  canvas.width = PANEL.w;
  canvas.height = PANEL.h;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.meters.w, PANEL.meters.h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  panel.position.set(-0.55, 1.15, -0.8);
  panel.rotation.y = 0.5;
  scene.add(panel);

  let selected: string | null = null;
  let hoverButton: PanelAction | null = null;

  const drawPanel = (s: GameState): void => {
    const txt = panelText(s, selected, api.speed());
    g.clearRect(0, 0, PANEL.w, PANEL.h);
    g.fillStyle = 'rgba(11,15,21,0.92)';
    g.fillRect(0, 0, PANEL.w, PANEL.h);
    g.strokeStyle = '#5ab4ff';
    g.lineWidth = 4;
    g.strokeRect(2, 2, PANEL.w - 4, PANEL.h - 4);
    g.fillStyle = '#dfe7f2';
    g.font = 'bold 30px system-ui, sans-serif';
    g.fillText(txt.header, 16, 40);
    g.font = '26px system-ui, sans-serif';
    txt.lines.slice(0, 4).forEach((l, i) => g.fillText(l, 16, 90 + i * 36));
    const target = dispatchTarget(s, selected);
    for (const b of PANEL_BUTTONS) {
      const off = b.id === 'dispatch' && !target;
      g.fillStyle = off ? '#26303d' : hoverButton === b.id ? '#5ab4ff' : '#18212e';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = '#41516a';
      g.lineWidth = 2;
      g.strokeRect(b.x, b.y, b.w, b.h);
      g.fillStyle = hoverButton === b.id && !off ? '#04121f' : off ? '#6b7788' : '#dfe7f2';
      g.font = 'bold 28px system-ui, sans-serif';
      g.fillText(b.label, b.x + 14, b.y + b.h / 2 + 10);
    }
    tex.needsUpdate = true;
  };

  const apply = (action: PanelAction): void => {
    const s = api.state();
    if (!s) return;
    if (action === 'pause') api.setSpeed(0);
    else if (action === 'speed1') api.setSpeed(1);
    else if (action === 'speed2') api.setSpeed(2);
    else if (action === 'speed4') api.setSpeed(4);
    else if (action === 'exit') void session.end();
    else if (action === 'dispatch') {
      const a = dispatchTarget(s, selected);
      const cmd = a ? dispatchCommand(a) : null;
      if (cmd) api.run(cmd);
    }
  };

  // controllers: a laser each, trigger picks
  const ray = new THREE.Raycaster();
  const panelInv = new THREE.Matrix4();
  const controllers = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -6)]), new THREE.LineBasicMaterial({ color: '#5ab4ff' }));
    c.add(line);
    scene.add(c);
    c.addEventListener('selectstart', () => {
      const hit = aim(c);
      if (hit.button) apply(hit.button);
      else if (hit.rack) selected = hit.rack;
    });
    return c;
  });

  /** What a controller points at: a panel button, or a rack. */
  const aim = (c: THREE.Object3D): { button: PanelAction | null; rack: string | null } => {
    const origin = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld);
    const dir = new THREE.Vector3(0, 0, -1).transformDirection(c.matrixWorld);
    ray.set(origin, dir);
    const onPanel = ray.intersectObject(panel)[0];
    if (onPanel) {
      panelInv.copy(panel.matrixWorld).invert();
      const local = onPanel.point.clone().applyMatrix4(panelInv);
      const uv = panelUv({ x: local.x, y: local.y });
      return { button: uv ? panelHit(uv.px, uv.py) : null, rack: null };
    }
    const s = api.state();
    if (!s) return { button: null, rack: null };
    const m = buildScene(s);
    return { button: null, rack: pickRack(m, { ox: origin.x, oy: origin.y, oz: origin.z, dx: dir.x, dy: dir.y, dz: dir.z }) };
  };

  const sync = (m: SceneModel, t: number): void => {
    const off = hallOffset(m);
    hall.position.set(off.x, 0, off.z);
    floor.scale.set(m.floor.w, 1, m.floor.d);
    for (const r of m.racks) {
      let mesh = rackMeshes.get(r.id);
      if (!mesh) {
        mesh = new THREE.Mesh(rackGeo, new THREE.MeshStandardMaterial({ color: r.color }));
        rackMeshes.set(r.id, mesh);
        hall.add(mesh);
        const b = new THREE.Mesh(beaconGeo, new THREE.MeshBasicMaterial({ color: '#ff3b5c' }));
        beacons.set(r.id, b);
        hall.add(b);
      }
      mesh.position.set(r.x, RACK_SIZE.h / 2, r.z);
      (mesh.material as THREE.MeshStandardMaterial).color.set(r.color);
      (mesh.material as THREE.MeshStandardMaterial).emissive.set(r.id === selected ? '#2a5f99' : '#000000');
      const b = beacons.get(r.id)!;
      b.visible = r.severity > 0 && Math.sin(t / (r.severity >= 3 ? 120 : 300)) > -0.3;
      b.position.set(r.x, RACK_SIZE.h + 0.35, r.z);
      (b.material as THREE.MeshBasicMaterial).color.set(SEV_COLOR[r.severity]!);
    }
    for (const c of m.coolers) {
      let mesh = coolerMeshes.get(c.id);
      if (!mesh) {
        mesh = new THREE.Mesh(coolerGeo, new THREE.MeshStandardMaterial({ color: '#4aa3ff' }));
        coolerMeshes.set(c.id, mesh);
        hall.add(mesh);
      }
      mesh.position.set(c.x, 0.35, c.z);
      (mesh.material as THREE.MeshStandardMaterial).color.set(c.on ? '#4aa3ff' : '#3a4352');
    }
    for (const tc of m.techs) {
      let mesh = techMeshes.get(tc.id);
      if (!mesh) {
        mesh = new THREE.Mesh(techGeo, new THREE.MeshStandardMaterial({ color: '#ffd400' }));
        techMeshes.set(tc.id, mesh);
        hall.add(mesh);
      }
      mesh.position.lerp(new THREE.Vector3(tc.x, 0.8, tc.z), 0.2);
      (mesh.material as THREE.MeshStandardMaterial).color.set(tc.busy ? '#ff8a00' : '#ffd400');
    }
  };

  let last = 0;
  renderer.setAnimationLoop((t: number) => {
    api.tick(t);
    const s = api.state();
    if (!s) return;
    sync(buildScene(s), t);
    hoverButton = null;
    for (const c of controllers) {
      const h = aim(c);
      if (h.button) hoverButton = h.button;
    }
    if (t - last > 200) {
      last = t;
      drawPanel(s);
    }
    renderer.render(scene, renderer.xr.getCamera());
  });

  await new Promise<void>((resolve) => session.addEventListener('end', () => resolve(), { once: true }));
  renderer.setAnimationLoop(null);
  renderer.dispose();
}
