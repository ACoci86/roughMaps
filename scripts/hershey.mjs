import { writeFileSync } from 'node:fs';

const out = process.argv[2] ?? 'public/hershey.json';
const SOURCE = 'https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts';
const LATIN = ['futural', 'futuram', 'timesr', 'timesrb', 'timesi', 'timesib', 'scripts', 'scriptc', 'cursive', 'gothiceng', 'gothicger', 'gothicita'];
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('');

const GREEK_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwx';
const GREEK = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω';
const TIMES_GREEK_KEYS = 'ABCDEFGHIKLMNOPQRSTUWXYZabcdefghiklmnopqrstuwxyz';
const TIMES_GREEK = 'ΑΒΧΔΕΦΓΗΙΚΛΜΝΟΠΘΡΣΤΥΩΞΨΖαβχδεφγηικλμνοπθρστυωξψζ';
const CYRILLIC_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CYRILLIC = 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩабвгдежзийклмнопрстуфхцчшщ';
const CYRILLIC_EXTRA_KEYS = 'CcUu]|^}_~$&';
const CYRILLIC_EXTRA = 'ЭэЮюЪъЯяЬьЫы';

const NOTICE = [
  'The Hershey Fonts were originally created by Dr. A. V. Hershey while working at the U. S. National Bureau of Standards.',
  'The format of the Font data in this distribution was originally created by James Hurt, Cognition, Inc., 900 Technology Park Drive, Billerica, MA 01821.',
];

async function glyphs(face) {
  const res = await fetch(`${SOURCE}/${face}.jhf`);
  if (!res.ok) throw new Error(`${face}: ${res.status}`);
  const lines = (await res.text()).split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const count = Number(lines[i].slice(5, 8));
    let data = lines[i].slice(8);
    while (data.length < count * 2 && i + 1 < lines.length) data += lines[++i];
    found.push(data.slice(0, count * 2));
  }
  if (found.length < 95) throw new Error(`${face}: ${found.length} glyphs`);
  return Object.fromEntries([...ASCII].map((char, i) => [char, found[i]]));
}

function pick(source, keys, chars) {
  return Object.fromEntries([...keys].map((key, i) => [[...chars][i], source[key]]));
}

function toLowercase(code) {
  let out = code.slice(0, 2);
  for (let i = 2; i < code.length; i += 2) {
    if (code[i] === ' ' && code[i + 1] === 'R') out += ' R';
    else out += code[i] + String.fromCharCode(82 + Math.round(-5 + ((code.charCodeAt(i + 1) - 82 + 12) * 14) / 21));
  }
  return out;
}

const fonts = {};
for (const face of LATIN) fonts[face] = await glyphs(face);
fonts.greeks = pick(await glyphs('greeks'), GREEK_KEYS, GREEK);
fonts.greekc = pick(await glyphs('greekc'), GREEK_KEYS, GREEK);
fonts.timesg = pick(await glyphs('timesg'), TIMES_GREEK_KEYS, TIMES_GREEK);
const extra = await glyphs('cyrillic');
fonts.cyrillic = {
  ...pick(await glyphs('cyrilc_1'), CYRILLIC_KEYS, CYRILLIC),
  ...pick(extra, CYRILLIC_EXTRA_KEYS, CYRILLIC_EXTRA),
  э: toLowercase(extra.C),
};

writeFileSync(out, JSON.stringify({ notice: NOTICE, fonts }));
console.log(`${Object.keys(fonts).length} Hershey fonts written to ${out}`);
