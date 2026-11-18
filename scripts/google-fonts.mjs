import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'public/google-fonts.json';
const res = await fetch('https://fonts.google.com/metadata/fonts');
const { familyMetadataList } = await res.json();

const fonts = familyMetadataList
  .filter((f) => /^[A-Za-z0-9 ]+$/.test(f.family))
  .filter((f) => !f.colorCapabilities?.length && !/Symbols|Emoji/.test(f.family))
  .sort((a, b) => a.popularity - b.popularity)
  .map((f) => {
    const upright = Object.keys(f.fonts).filter((k) => /^\d+$/.test(k)).map(Number);
    let weights = [400, 700].filter((w) => upright.includes(w));
    if (!weights.length) weights = [upright.sort((a, b) => Math.abs(a - 400) - Math.abs(b - 400))[0]];
    return [f.family, f.category, weights];
  })
  .filter(([, , weights]) => weights[0]);

writeFileSync(out, JSON.stringify(fonts));
console.log(`${fonts.length} fonts written to ${out}`);
