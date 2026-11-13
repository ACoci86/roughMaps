import type { Drawable, Op, OpSet, Options } from 'roughjs/bin/core';
import { resolveOptions, type PathLine } from './roughpath';

export type ShapeJob = { lines: PathLine[]; options: Options };
export type Request = { coords: Float64Array; jobs: { lines: number[]; options: Options }[] };
export type Reply = { data: Float64Array };

const SET_TYPES: OpSet['type'][] = ['path', 'fillPath', 'fillSketch'];
const OP_TYPES: Op['op'][] = ['move', 'bcurveTo', 'lineTo'];
const MISSING = -1;

export function packJobs(jobs: ShapeJob[]): Request {
  let total = 0;
  for (const { lines } of jobs) {
    for (const { points } of lines) total += points.length * 2;
  }
  const coords = new Float64Array(total);
  let at = 0;
  const packed = jobs.map(({ lines, options }) => {
    const sizes: number[] = [];
    for (const { points, closed } of lines) {
      sizes.push(points.length, closed ? 1 : 0);
      for (const [x, y] of points) {
        coords[at++] = x;
        coords[at++] = y;
      }
    }
    return { lines: sizes, options };
  });
  return { coords, jobs: packed };
}

export function unpackJobs({ coords, jobs }: Request): ShapeJob[] {
  let at = 0;
  return jobs.map(({ lines, options }) => {
    const shape: PathLine[] = [];
    for (let k = 0; k < lines.length; k += 2) {
      const points: [number, number][] = [];
      for (let p = 0; p < lines[k]; p++, at += 2) points.push([coords[at], coords[at + 1]]);
      shape.push({ points, closed: lines[k + 1] === 1 });
    }
    return { lines: shape, options };
  });
}

export function packDrawables(drawables: (Drawable | null)[]): Float64Array {
  let total = 0;
  for (const drawable of drawables) {
    total++;
    if (!drawable) continue;
    for (const { ops } of drawable.sets) {
      total += 2;
      for (const { data } of ops) total += 1 + data.length;
    }
  }
  const out = new Float64Array(total);
  let at = 0;
  for (const drawable of drawables) {
    if (!drawable) {
      out[at++] = MISSING;
      continue;
    }
    out[at++] = drawable.sets.length;
    for (const { type, ops } of drawable.sets) {
      out[at++] = SET_TYPES.indexOf(type);
      out[at++] = ops.length;
      for (const { op, data } of ops) {
        out[at++] = OP_TYPES.indexOf(op);
        for (const value of data) out[at++] = value;
      }
    }
  }
  return out;
}

export function unpackDrawables(data: Float64Array, jobs: ShapeJob[]): (Drawable | null)[] {
  let at = 0;
  return jobs.map(({ options }) => {
    const setCount = data[at++];
    if (setCount === MISSING) return null;
    const sets: OpSet[] = [];
    for (let s = 0; s < setCount; s++) {
      const type = SET_TYPES[data[at++]];
      const opCount = data[at++];
      const ops: Op[] = new Array(opCount);
      for (let o = 0; o < opCount; o++) {
        const op = OP_TYPES[data[at++]];
        if (op === 'bcurveTo') {
          ops[o] = { op, data: [data[at], data[at + 1], data[at + 2], data[at + 3], data[at + 4], data[at + 5]] };
          at += 6;
        } else {
          ops[o] = { op, data: [data[at], data[at + 1]] };
          at += 2;
        }
      }
      sets.push({ type, ops });
    }
    return { shape: 'path', sets, options: resolveOptions(options) };
  });
}
