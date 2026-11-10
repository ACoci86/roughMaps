const encoder = new TextEncoder();

export async function imagePdf(
  jpeg: Blob,
  pixels: { width: number; height: number },
  page: { width: number; height: number },
  title: string,
): Promise<Blob> {
  const image = new Uint8Array(await jpeg.arrayBuffer());
  const w = page.width.toFixed(2);
  const h = page.height.toFixed(2);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Map Do Q`;
  const safeTitle = title.replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1');

  const objects: (string | Uint8Array)[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Map 5 0 R >> >> /Contents 4 0 R >>`],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${pixels.width} /Height ${pixels.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
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
