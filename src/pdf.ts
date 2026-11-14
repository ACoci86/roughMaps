const encoder = new TextEncoder();

function predictRows(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const row = width * 3;
  const out = new Uint8Array((row + 1) * height);
  let previous = new Uint8Array(row);
  let current = new Uint8Array(row);
  for (let y = 0; y < height; y++) {
    const source = y * width * 4;
    for (let x = 0, i = 0; x < width; x++, i += 3) {
      const s = source + x * 4;
      current[i] = rgba[s];
      current[i + 1] = rgba[s + 1];
      current[i + 2] = rgba[s + 2];
    }
    const start = y * (row + 1);
    out[start] = 2;
    for (let i = 0; i < row; i++) out[start + 1 + i] = (current[i] - previous[i]) & 0xff;
    [previous, current] = [current, previous];
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function imagePdf(
  canvas: HTMLCanvasElement,
  page: { width: number; height: number },
  title: string,
  bleed = 0,
): Promise<Blob> {
  const { width: pw, height: ph } = canvas;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, pw, ph).data;
  const image = await deflate(predictRows(pixels, pw, ph));

  const w = page.width.toFixed(2);
  const h = page.height.toFixed(2);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Map Do Q`;
  const b = bleed.toFixed(2);
  const trimBox = bleed > 0
    ? ` /BleedBox [0 0 ${w} ${h}] /TrimBox [${b} ${b} ${(page.width - bleed).toFixed(2)} ${(page.height - bleed).toFixed(2)}]`
    : '';
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1');

  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}]${trimBox} /Resources << /XObject << /Map 5 0 R >> >> /Contents 4 0 R >>`],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
        `/Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${pw} >> /Length ${image.length} >>\nstream\n`,
      image,
      '\nendstream',
    ],
    [`<< /Title (${safeTitle}) /Producer (roughMaps) >>`],
  ];

  const parts: Uint8Array[] = [];
  let offset = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    parts.push(bytes);
    offset += bytes.length;
  };

  push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    push(`${i + 1} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  });
  const xref = offset;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) push(`${String(o).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}
