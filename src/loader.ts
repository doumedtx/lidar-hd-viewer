import { load } from '@loaders.gl/core';
import { LAZRsLoader } from '@loaders.gl/las';

export interface CloudData {
  name: string;
  count: number;
  positions: Float32Array;
  classes: Uint8Array;
  intensities: Uint8Array;
  elevNorm: Float32Array;
  elevationMin: number;
  elevationMax: number;
  hasColor: boolean;
  colors: Uint8Array | null;
  classCounts: Map<number, number>;
  center: [number, number, number];
  extent: [number, number, number];
  version: string;
  pointFormat: number;
  compressed: boolean;
}

interface LasLoaderResult {
  attributes: Record<string, { value: ArrayLike<number> }>;
  header: { vertexCount: number; boundingBox: number[][] };
  loaderData: {
    versionAsString?: string;
    pointsFormatId?: number;
    isCompressed?: boolean;
  };
}

export async function parsePointCloud(
  data: ArrayBuffer,
  name: string
): Promise<CloudData> {
  const result = (await load(data, LAZRsLoader, {
    worker: false,
    las: { shape: 'mesh', colorDepth: 'auto' }
  })) as LasLoaderResult;

  const attrs = result.attributes;
  const header = result.loaderData;
  const count = result.header.vertexCount | 0;
  if (!count || !attrs.POSITION) {
    throw new Error('Fichier lisible mais vide (aucun point).');
  }

  const raw = attrs.POSITION.value as Float32Array;
  const bb = result.header.boundingBox;
  const bboxMin: [number, number, number] = [bb[0][0], bb[0][1], bb[0][2]];
  const bboxMax: [number, number, number] = [bb[1][0], bb[1][1], bb[1][2]];
  const cx = (bboxMin[0] + bboxMax[0]) / 2;
  const cy = (bboxMin[1] + bboxMax[1]) / 2;
  const cz = (bboxMin[2] + bboxMax[2]) / 2;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = raw[i * 3] - cx;
    positions[i * 3 + 1] = raw[i * 3 + 1] - cy;
    positions[i * 3 + 2] = raw[i * 3 + 2] - cz;
  }

  const pointFormat = (header.pointsFormatId ?? 0) & 0x3f;
  const classMask = pointFormat >= 6 ? 31 : 255;

  const rawClasses = (attrs.classification?.value ?? new Uint8Array(count)) as Uint8Array;
  const classes = new Uint8Array(count);
  const classCounts = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const c = rawClasses[i] & classMask;
    classes[i] = c;
    classCounts.set(c, (classCounts.get(c) ?? 0) + 1);
  }

  const rawIntensity = attrs.intensity?.value as Uint16Array | undefined;
  const intensities = new Uint8Array(count);
  let maxIntensity = 1;
  for (let i = 0; i < count; i++) {
    if (rawIntensity && rawIntensity[i] > maxIntensity) maxIntensity = rawIntensity[i];
  }
  const intensityScale = 255 / maxIntensity;
  if (rawIntensity) {
    for (let i = 0; i < count; i++) {
      intensities[i] = Math.min(255, Math.round(rawIntensity[i] * intensityScale));
    }
  }

  const elevationMin = bboxMin[2];
  const elevationMax = bboxMax[2];
  const rangeZ = Math.max(elevationMax - elevationMin, 1e-6);
  const elevNorm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    elevNorm[i] = (positions[i * 3 + 2] + cz - elevationMin) / rangeZ;
  }

  const hasColor = !!attrs.COLOR_0;
  const colors = hasColor ? (attrs.COLOR_0.value as Uint8Array) : null;

  return {
    name,
    count,
    positions,
    classes,
    intensities,
    elevNorm,
    elevationMin,
    elevationMax,
    hasColor,
    colors,
    classCounts,
    center: [cx, cy, cz],
    extent: [bboxMax[0] - bboxMin[0], bboxMax[1] - bboxMin[1], rangeZ],
    version: String(header.versionAsString ?? ''),
    pointFormat,
    compressed: Boolean(header.isCompressed)
  };
}

export function formatCount(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' Md';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + ' k';
  return String(n);
}
