// Cache public CS data (CSrankings, CSStipendRankings, fellowships, AI-residency list) under .local/research-sources
// and build us-faculty-active.csv (active US faculty + homepage + top areas). Data stays git-ignored: it is
// CC BY-NC-ND, so use it for research only and never redistribute or commit it.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '.local', 'research-sources');
const GH = 'https://raw.githubusercontent.com';
const files = {
  'stipend-us.csv': `${GH}/CSStipendRankings/CSStipendRankings/main/stipend-us.csv`,
  'fellowship-us.csv': `${GH}/CSStipendRankings/CSStipendRankings/main/fellowship-us.csv`,
  'csphdfellowships.csv': `${GH}/csphdfellowships/csphdfellowships/main/fellowships.csv`, // stale since Aug 2024
  'ai-residency-programs.md': `${GH}/BryanBradfo/ai-residency-programs/main/README.md`,
  'institutions.csv': `${GH}/emeryberger/CSrankings/gh-pages/institutions.csv`,
  'generated-author-info.csv': `${GH}/emeryberger/CSrankings/gh-pages/generated-author-info.csv`,
  ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((l) => [`csrankings-${l}.csv`, `${GH}/emeryberger/CSrankings/gh-pages/csrankings-${l}.csv`])),
};

const parse = (line) => { const out = []; let cur = ''; let q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; }
  return [...out, cur]; };
const rows = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').slice(1).filter(Boolean).map(parse);
// CSrankings venue keys grouped coarsely; unknown venues fall into "other".
const GROUPS = {
  ml: 'aaai ijcai icml iclr nips kdd vision cvpr eccv iccv acl emnlp naacl',
  theory: 'stoc focs soda ccc lics cav',
  systems: 'sosp osdi eurosys usenixatc nsdi sigcomm asplos isca micro sigmod vldb pods icde hpca',
  se_sec_hci: 'ccs uss ndss sp crypto eurocrypt pldi popl icse fse ase oopsla chiconf uist',
  robotics_bio: 'iros icra rss bioinformatics ismb recomb',
};
const areaGroup = Object.fromEntries(Object.entries(GROUPS).flatMap(([g, v]) => v.split(' ').map((a) => [a, g])));

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, url] of Object.entries(files)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  }
  const us = new Set(rows('institutions.csv').filter((r) => r[2] === 'us').map((r) => r[0]));
  const faculty = new Map();
  for (const l of 'abcdefghijklmnopqrstuvwxyz') {
    for (const [name, inst, home, scholar] of rows(`csrankings-${l}.csv`)) if (us.has(inst)) faculty.set(name, { name, inst, home, scholar });
  }
  const scores = new Map();
  for (const [name, , area, , adjusted, year] of rows('generated-author-info.csv')) {
    if (+year < 2022 || !faculty.has(name)) continue; // ponytail: fixed 2022+ window, make it a CLI arg if needed
    const s = scores.get(name) || {}; const g = areaGroup[area] || 'other';
    s[g] = (s[g] || 0) + +adjusted; scores.set(name, s);
  }
  const q = (v) => `"${String(v).replace(/"/g, '')}"`;
  const roster = [...scores].map(([name, s]) => ({ ...faculty.get(name), s, total: Object.values(s).reduce((a, b) => a + b, 0) }))
    .filter((x) => x.total >= 2).sort((a, b) => b.total - a.total);
  const lines = ['inst,name,homepage,scholarid,top_areas,score', ...roster.map((x) => [x.inst, x.name, x.home, x.scholar,
    Object.entries(x.s).sort((a, b) => b[1] - a[1]).slice(0, 2).map((e) => e[0]).join('|'), x.total.toFixed(1)].map(q).join(','))];
  fs.writeFileSync(path.join(dir, 'us-faculty-active.csv'), `${lines.join('\n')}\n`);
  console.log(`Cached ${Object.keys(files).length} files; roster has ${roster.length} active US faculty.`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
