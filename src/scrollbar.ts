import rough from 'roughjs';

const NS = 'http://www.w3.org/2000/svg';
const WIDTH = 22;
const MIN_THUMB = 44;
const INK = '#1a1a1a';

export function roughScrollbar(panel: HTMLElement, bar: HTMLElement): void {
  const svg = document.createElementNS(NS, 'svg');
  const track = document.createElementNS(NS, 'g');
  const thumb = document.createElementNS(NS, 'g');
  thumb.classList.add('thumb');
  svg.append(track, thumb);
  bar.append(svg);
  const rc = rough.svg(svg);

  let trackSize = 0;
  let thumbSize = 0;

  const range = () => panel.scrollHeight - panel.clientHeight;
  const travel = () => trackSize - thumbSize;

  function position(): void {
    const max = range();
    const offset = max > 0 ? (panel.scrollTop / max) * travel() : 0;
    thumb.setAttribute('transform', `translate(0 ${offset.toFixed(1)})`);
  }

  function draw(): void {
    svg.setAttribute('width', String(WIDTH));
    svg.setAttribute('height', String(trackSize));
    track.replaceChildren(
      rc.rectangle(3, 2, WIDTH - 6, trackSize - 4, { stroke: INK, strokeWidth: 1, roughness: 1.2, seed: 3 }),
    );
    thumb.replaceChildren(
      rc.rectangle(5, 4, WIDTH - 10, thumbSize - 8, {
        stroke: INK,
        strokeWidth: 1.6,
        roughness: 1.4,
        fill: INK,
        fillStyle: 'zigzag',
        hachureGap: 3.2,
        fillWeight: 1.2,
        seed: 7,
      }),
    );
  }

  function layout(): void {
    const show = range() > 1;
    bar.hidden = !show;
    if (!show) return;
    const newTrack = bar.clientHeight;
    const newThumb = Math.round(Math.max(MIN_THUMB, (newTrack * panel.clientHeight) / panel.scrollHeight));
    if (newTrack !== trackSize || newThumb !== thumbSize) {
      trackSize = newTrack;
      thumbSize = newThumb;
      draw();
    }
    position();
  }

  let drag: { y: number; scroll: number } | null = null;

  bar.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const top = bar.getBoundingClientRect().top;
    const thumbTop = top + (range() > 0 ? (panel.scrollTop / range()) * travel() : 0);
    if (event.clientY >= thumbTop && event.clientY <= thumbTop + thumbSize) {
      drag = { y: event.clientY, scroll: panel.scrollTop };
      bar.setPointerCapture(event.pointerId);
      bar.classList.add('dragging');
    } else {
      const direction = event.clientY < thumbTop ? -1 : 1;
      panel.scrollBy({ top: direction * panel.clientHeight * 0.9, behavior: 'smooth' });
    }
  });

  bar.addEventListener('pointermove', (event) => {
    if (!drag || travel() <= 0) return;
    panel.scrollTop = drag.scroll + ((event.clientY - drag.y) * range()) / travel();
  });

  const stop = () => {
    drag = null;
    bar.classList.remove('dragging');
  };
  bar.addEventListener('pointerup', stop);
  bar.addEventListener('pointercancel', stop);

  bar.addEventListener('wheel', (event) => panel.scrollBy({ top: event.deltaY }), { passive: true });
  panel.addEventListener('scroll', position, { passive: true });

  const observer = new ResizeObserver(layout);
  observer.observe(panel);
  observer.observe(bar);
  for (const child of panel.children) observer.observe(child);

  layout();
}
