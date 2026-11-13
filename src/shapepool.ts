import type { Drawable } from 'roughjs/bin/core';
import { packJobs, unpackDrawables, type Reply, type ShapeJob } from './shapewire';

type Task = {
  jobs: ShapeJob[];
  first: number;
  step: number;
  done: (index: number, drawable: Drawable) => void;
  finish: () => void;
};
type Helper = { worker: Worker; tasks: Task[] };

const MIN_SHARE = 40;
const MAX_HELPERS = 6;
const GIVE_UP = 10000;
let helpers: Helper[] | null = null;

function stopAll(): void {
  for (const helper of helpers ?? []) {
    helper.worker.terminate();
    for (const task of helper.tasks.splice(0)) task.finish();
  }
  helpers = [];
}

function settle(helper: Helper, reply: Reply): void {
  const task = helper.tasks.shift();
  if (!task) return;
  unpackDrawables(reply.data, task.jobs).forEach((drawable, k) => {
    if (drawable) task.done(task.first + k * task.step, drawable);
  });
  task.finish();
}

function team(): Helper[] {
  if (helpers) return helpers;
  helpers = [];
  if (typeof Worker === 'undefined') return helpers;
  const count = Math.max(1, Math.min(MAX_HELPERS, (navigator.hardwareConcurrency || 2) - 1));
  try {
    for (let k = 0; k < count; k++) {
      const worker = new Worker(new URL('./shapeworker.ts', import.meta.url), { type: 'module' });
      const helper: Helper = { worker, tasks: [] };
      worker.onmessage = (event: MessageEvent<Reply>) => settle(helper, event.data);
      worker.onerror = stopAll;
      helpers.push(helper);
    }
  } catch {
    stopAll();
  }
  return helpers;
}

export function makeShapes(jobs: ShapeJob[], done: (index: number, drawable: Drawable) => void): Promise<void> {
  const ready = team();
  if (!ready.length || !jobs.length) return Promise.resolve();
  return new Promise((resolve) => {
    const shares = Math.max(1, Math.min(ready.length, Math.floor(jobs.length / MIN_SHARE)));
    let left = shares;
    const timer = setTimeout(resolve, GIVE_UP);
    const finish = () => {
      if (--left > 0) return;
      clearTimeout(timer);
      resolve();
    };
    const busiest = (a: Helper, b: Helper) => a.tasks.length - b.tasks.length;
    const free = [...ready].sort(busiest);
    try {
      for (let first = 0; first < shares; first++) {
        const share = jobs.filter((_, index) => index % shares === first);
        const helper = free[first];
        const request = packJobs(share);
        helper.tasks.push({ jobs: share, first, step: shares, done, finish });
        helper.worker.postMessage(request, [request.coords.buffer]);
      }
    } catch {
      stopAll();
    }
  });
}

team();
