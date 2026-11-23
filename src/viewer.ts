import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { classInfo, MAX_PALETTE_CLASSES } from './classes';
import type { CloudData } from './loader';

export type ColorMode = 'classification' | 'elevation' | 'intensity' | 'uniform';

const VERT = /* glsl */ `
  attribute float aClass;
  attribute float aIntensity;
  attribute float aElev;
  attribute vec3 aColor;
  uniform float uPointSize;
  uniform vec3 uColor;
  uniform int uColorMode;
  uniform float uIntensityGain;
  uniform float uElevMin;
  uniform float uElevMax;
  uniform float uClassVisible[32];
  uniform vec3 uClassPalette[32];
  uniform bool uHasColor;
  varying vec3 vColor;

  vec3 elevationColor(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a, b;
    if (t < 0.25) { a = vec3(0.03, 0.11, 0.55); b = vec3(0.00, 0.71, 0.83); t = t * 4.0; }
    else if (t < 0.5) { a = vec3(0.00, 0.71, 0.83); b = vec3(0.19, 0.78, 0.25); t = (t - 0.25) * 4.0; }
    else if (t < 0.75) { a = vec3(0.19, 0.78, 0.25); b = vec3(0.98, 0.88, 0.21); t = (t - 0.5) * 4.0; }
    else { a = vec3(0.98, 0.88, 0.21); b = vec3(0.86, 0.16, 0.11); t = (t - 0.75) * 4.0; }
    return mix(a, b, t);
  }

  void main() {
    float ci = clamp(aClass, 0.0, 31.0);
    if (uClassVisible[int(ci)] < 0.5 || aElev < uElevMin || aElev > uElevMax) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = vec3(0.0);
      return;
    }
    if (uColorMode == 0) {
      vColor = (uHasColor && aColor != vec3(0.0)) ? aColor : uClassPalette[int(ci)];
    } else if (uColorMode == 1) {
      vColor = elevationColor((aElev - uElevMin) / max(uElevMax - uElevMin, 0.0001));
    } else if (uColorMode == 2) {
      vColor = vec3(clamp(aIntensity * uIntensityGain, 0.0, 1.0));
    } else {
      vColor = uColor;
    }
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointSize;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    if (dot(d, d) > 0.25) discard;
    gl_FragColor = vec4(vColor, 1.0);
  }
`;

export interface ViewerState {
  colorMode: ColorMode;
  uniformColor: number;
  intensityGain: number;
  pointSize: number;
  stride: number;
  elevMinT: number;
  elevMaxT: number;
  visibleClasses: Set<number>;
}

export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points | null = null;
  private cloud: CloudData | null = null;
  private radius = 100;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1117);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1e7);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(150, -150, 120);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomSpeed = 1.4;

    const palette = new Float32Array(MAX_PALETTE_CLASSES * 3);
    for (let i = 0; i < MAX_PALETTE_CLASSES; i++) {
      const c = new THREE.Color(classInfo(i).color);
      palette[i * 3] = c.r;
      palette[i * 3 + 1] = c.g;
      palette[i * 3 + 2] = c.b;
    }
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPointSize: { value: 2 },
        uColor: { value: new THREE.Color(0x8fd4ff) },
        uColorMode: { value: 0 },
        uIntensityGain: { value: 1 },
        uElevMin: { value: 0 },
        uElevMax: { value: 1 },
        uClassVisible: {
          value: new Float32Array(MAX_PALETTE_CLASSES).fill(1)
        },
        uClassPalette: {
          value: palette
        },
        uHasColor: { value: false }
      },
      vertexShader: VERT,
      fragmentShader: FRAG
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.animate();
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  hasCloud() {
    return this.cloud !== null;
  }

  getCloud() {
    return this.cloud;
  }

  setCloud(cloud: CloudData, state: ViewerState) {
    this.disposeCloud();
    this.cloud = cloud;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3));
    geometry.setAttribute('aClass', new THREE.BufferAttribute(cloud.classes, 1));
    geometry.setAttribute('aIntensity', new THREE.BufferAttribute(cloud.intensities, 1, true));
    geometry.setAttribute('aElev', new THREE.BufferAttribute(cloud.elevNorm, 1));
    if (cloud.colors) {
      const rgb = new Uint8Array(cloud.colors.length);
      for (let i = 0; i < cloud.colors.length; i += 4) {
        rgb[i] = cloud.colors[i];
        rgb[i + 1] = cloud.colors[i + 1];
        rgb[i + 2] = cloud.colors[i + 2];
      }
      geometry.setAttribute('aColor', new THREE.BufferAttribute(rgb, 3, true));
    }

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.radius = Math.max(cloud.extent[0], cloud.extent[1]) / 2;
    this.camera.far = Math.max(this.radius * 30, 100);
    this.camera.near = this.radius / 1000;
    this.camera.updateProjectionMatrix();
    this.controls.maxDistance = this.radius * 40;

    this.applyState(state);
    this.view3D();
  }

  applyState(state: ViewerState) {
    const u = this.material.uniforms;
    u.uColorMode.value = { classification: 0, elevation: 1, intensity: 2, uniform: 3 }[state.colorMode];
    (u.uColor.value as THREE.Color).set(state.uniformColor);
    u.uIntensityGain.value = state.intensityGain;
    u.uPointSize.value = state.pointSize;
    u.uElevMin.value = state.elevMinT;
    u.uElevMax.value = state.elevMaxT;
    const visible = new Float32Array(MAX_PALETTE_CLASSES);
    for (const c of state.visibleClasses) {
      if (c < MAX_PALETTE_CLASSES) visible[c] = 1;
    }
    u.uClassVisible.value = visible;
    u.uHasColor.value = !!this.cloud?.hasColor;
    this.applyStride(state.stride);
  }

  private applyStride(stride: number) {
    if (!this.points || !this.cloud) return;
    const geometry = this.points.geometry;
    if (stride <= 1) {
      geometry.setIndex(null);
      geometry.setDrawRange(0, this.cloud.count);
    } else {
      const n = Math.ceil(this.cloud.count / stride);
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i * stride;
      geometry.setIndex(new THREE.BufferAttribute(idx, 1));
      geometry.setDrawRange(0, n);
    }
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), this.radius * 2);
  }

  view3D() {
    const d = this.radius * 2.2;
    this.camera.position.set(d * 0.7, -d * 0.7, d * 0.55);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  viewTop() {
    const d = this.radius * 2.4;
    this.camera.position.set(0, -d * 0.001, d);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  disposeCloud() {
    if (!this.points) return;
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.points = null;
    this.cloud = null;
  }

  dispose() {
    this.disposeCloud();
    this.renderer.dispose();
  }
}
