const SEGS = 'ABCDEFGH';
const X_DEG = 32, X_DH = 33, X_DL = 34, X_DM = 35, NLED = 36;
const SEGMENTS = {
  '0': 'ABCDEF', '1': 'BC', '2': 'ABDEG', '3': 'ABCDG', '4': 'BCFG', '5': 'ACDFG', '6': 'ACDEFG', '7': 'ABC', '8': 'ABCDEFG', '9': 'ABCDFG',
  A: 'ABCEFG', B: 'CDEFG', C: 'ADEF', D: 'BCDEG', E: 'ADEFG', F: 'AEFG', G: 'ACDEF', H: 'BCEFG', I: 'EF', J: 'BCDE',
  L: 'DEF', N: 'CEG', O: 'CDEG', P: 'ABEFG', R: 'EG', S: 'ACDFG', T: 'DEFG', U: 'BCDEF', Y: 'BCDFG', '-': 'G', '_': 'D', ' ': '', '°': 'ABFG',
};
const blankFrame = () => new Array(NLED).fill(0);

function textToFrame(text, bright = 255, extras = {}) {
  const v = blankFrame();
  let pos = -1;
  for (const ch of String(text).toUpperCase()) {
    if (ch === ':') { v[X_DH] = v[X_DL] = bright; continue; }
    if (ch === '.') { if (pos >= 0) v[pos * 8 + 7] = bright; continue; }
    if (++pos > 3) break;
    for (const s of SEGMENTS[ch] ?? '') v[pos * 8 + SEGS.indexOf(s)] = bright;
  }
  if (extras.dh) v[X_DH] = bright;
  if (extras.dl) v[X_DL] = bright;
  if (extras.dm) v[X_DM] = bright;
  if (extras.degree) v[X_DEG] = bright;
  return v;
}

// Геометрия: цифра 56×96, толщина сегмента 10; между 2-й и 3-й цифрой — двоеточие и средняя точка.
const DIGIT_X = [0, 70, 172, 242];
function segShapes(x) {
  const t = 10, w = 56, h = 96, m = h / 2;
  return [
    ['A', `M${x + 6} 0h${w - 12}l-6 ${t}h${-(w - 24)}z`],
    ['B', `M${x + w} 6v${m - 9}l-${t} -5v${-(m - 21)}z`],
    ['C', `M${x + w} ${m + 3}v${m - 9}l-${t} -6v${-(m - 21)}z`],
    ['D', `M${x + 6} ${h}h${w - 12}l-6 -${t}h${-(w - 24)}z`],
    ['E', `M${x} ${m + 3}v${m - 9}l${t} -6v${-(m - 21)}z`],
    ['F', `M${x} 6v${m - 9}l${t} -5v${-(m - 21)}z`],
    ['G', `M${x + 4} ${m}l6 -${t / 2}h${w - 20}l6 ${t / 2}l-6 ${t / 2}h${-(w - 20)}z`],
  ];
}

export {segShapes,DIGIT_X,SEGS,X_DH,X_DL,X_DM,X_DEG,textToFrame};
