// Local dev tool — turns the grade 6 vocabulary list (../C_Vokabeln/vokabeln.md,
// the hand-checked transcription of the Green Line 2 Bayern vocabulary section)
// into the "vocab" arrays of src/data/grade6/k6u1.json … k6u6.json.
//
// Only "vocab" (plus unit/grade/title) is (re)generated. Everything else in an
// existing k6uN.json — grammarTopics, grammarQuestions, conversationScenarios —
// is hand-written and kept as it is, so this script can be re-run safely after
// fixing a word in vokabeln.md.
//
// Usage: node scripts/buildGrade6Content.js [path-to-vokabeln.md]

const fs = require('fs');
const path = require('path');

const SOURCE = path.resolve(process.argv[2] || path.join(__dirname, '../../C_Vokabeln/vokabeln.md'));
const OUT_DIR = path.resolve(__dirname, '../src/data/grade6');
const GRADE = 6;

// Focus / Across cultures pages belong to the unit before them in the book.
const EXTRA_SECTION_UNIT = {
  'Focus 1': 1,
  'Across cultures 1': 2,
  'Across cultures 2': 3,
  'Focus 2': 4,
  'Focus 3': 5,
  'Across cultures 3': 6
};

// BE equivalents for AE words whose row doesn't name the BE word itself.
const KNOWN_BE_FOR_AE = {
  'cell phone': 'mobile (phone)',
  pants: 'trousers',
  flashlight: 'torch'
};

const PHRASE_STARTERS = new Set([
  'I', "I'm", 'You', 'What', 'How', 'Where', 'Who', 'Why', 'When', "There's", 'There', "It's",
  "Let's", 'Can', 'Could', 'Would', "Don't", 'Have', 'See', 'Good', 'Thank', 'Excuse', 'Well',
  'Oh', "That's", 'Never', 'Get', 'Be', 'Take', 'Go', 'Turn', 'Is', 'Are', 'Do', 'Does', 'Just'
]);

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function cleanCell(text) {
  return text.trim().replace(/\s+/g, ' ');
}

// "Station 1 – I don't even know if she's nice" → { section: "Station 1", sectionTitle: "…" }
function splitHeading(heading) {
  const [section, ...rest] = heading.split(' – ');
  return {
    section: section.trim(),
    sectionTitle: rest.join(' – ').replace(/\s*\(Buch[^)]*\)\s*$/, '').trim()
  };
}

function isNoteSegment(segment) {
  return /[=↔→]/.test(segment) && !/[.!?]$/.test(segment.trim());
}

// Splits the "Beispiel / Hinweis" column into a real example sentence and the
// notes around it: ⚠️ warnings, word-family hints like "(→ teacher)" and
// "x ↔ y" / "AE = BE" remarks.
function splitHint(hint) {
  const notes = [];
  let text = hint;

  const warnIdx = text.indexOf('⚠️');
  if (warnIdx !== -1) {
    notes.push('⚠️ ' + text.slice(warnIdx + 2).trim());
    text = text.slice(0, warnIdx).trim();
  }

  // trailing "(… → …)", "(= …)", "(… ↔ …)" hints
  let match;
  while ((match = text.match(/\s*\(([^()]*[=↔→][^()]*)\)\s*$/))) {
    notes.unshift(match[1].trim());
    text = text.slice(0, match.index).trim();
  }

  // sentence-level split: "Let's watch a movie. movie (AE) = film (BE)"
  const segments = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const exampleParts = [];
  const segmentNotes = [];
  for (const segment of segments) {
    if (isNoteSegment(segment)) segmentNotes.push(segment.trim());
    else exampleParts.push(segment.trim());
  }
  notes.unshift(...segmentNotes);

  return { example: exampleParts.join(' '), notes: notes.join(' · ') };
}

function findPair(en, hint) {
  const isAE = /\(AE\)/.test(en);
  const isBE = /\(BE\)/.test(en);
  const word = (s) => s.replace(/\((?:AE|BE|pl|sg|km)\)/g, '').replace(/\s+/g, ' ').trim();

  const patterns = [
    // "movie theater (AE) = cinema (BE)"
    /([A-Za-z][A-Za-z ()]*?)\s*\((AE|BE)\)\s*=\s*([A-Za-z][A-Za-z ()]*?)\s*\((AE|BE)\)/,
    // "AE colonize = BE colonise"
    /\b(AE|BE)\s+([A-Za-z]+)\s*=\s*(AE|BE)\s+([A-Za-z]+)/,
    // "trash AE = rubbish BE"
    /([A-Za-z][A-Za-z ]*?)\s+(AE|BE)\s*=\s*([A-Za-z][A-Za-z ]*?)\s+(AE|BE)\b/
  ];

  for (const [i, re] of patterns.entries()) {
    const m = hint.match(re);
    if (!m) continue;
    const pairs = i === 1 ? [[m[1], m[2]], [m[3], m[4]]] : [[m[2], m[1]], [m[4], m[3]]];
    const result = {};
    for (const [variety, w] of pairs) result[variety.toLowerCase()] = word(w);
    if (result.ae && result.be) return result;
  }

  if (isAE || isBE) {
    const own = word(en);
    if (isAE && KNOWN_BE_FOR_AE[own]) return { ae: own, be: KNOWN_BE_FOR_AE[own] };
    return isAE ? { ae: own, be: null } : { be: own, ae: null };
  }
  return null;
}

function detectType(en, pair) {
  if (pair) return 'pair';
  if (/…|[.!?]$/.test(en)) return 'phrase';
  const first = en.split(' ')[0];
  if (en.includes(' ') && PHRASE_STARTERS.has(first)) return 'phrase';
  return 'word';
}

function parseVocabulary(markdown) {
  const units = new Map(); // unit number → { unit, title, vocab: [] }
  const problems = [];
  let currentUnit = null;
  let currentSection = null; // { section, sectionTitle, unit }
  let inBox = false;

  const lines = markdown.split('\n');
  lines.forEach((line, i) => {
    const lineNo = i + 1;

    const unitHeading = line.match(/^## Unit (\d+) – (.+)$/);
    if (unitHeading) {
      currentUnit = Number(unitHeading[1]);
      const title = unitHeading[2].replace(/\s*\(Buch[^)]*\)\s*$/, '').trim();
      units.set(currentUnit, { unit: currentUnit, title, vocab: [] });
      currentSection = null;
      return;
    }

    const extraHeading = line.match(/^## ((?:Focus|Across cultures) \d+ – .+)$/);
    if (extraHeading) {
      const { section, sectionTitle } = splitHeading(extraHeading[1]);
      const unit = EXTRA_SECTION_UNIT[section];
      if (!unit) problems.push(`Zeile ${lineNo}: unbekannter Abschnitt "${section}"`);
      if (unit !== currentUnit) {
        problems.push(`Zeile ${lineNo}: "${section}" steht nach Unit ${currentUnit}, wird aber Unit ${unit} zugeordnet`);
      }
      currentSection = { section, sectionTitle, unit };
      return;
    }

    const sectionHeading = line.match(/^### (.+)$/);
    if (sectionHeading) {
      currentSection = { ...splitHeading(sectionHeading[1]), unit: currentUnit };
      return;
    }

    if (/^\*\*Box/.test(line)) inBox = true;
    if (line.trim() === '' || /^#/.test(line)) inBox = false;

    if (!line.startsWith('|')) return;
    const cells = line.split('|').slice(1, -1).map(cleanCell);
    if (cells[0] === 'Englisch' || /^-+$/.test(cells[0])) return;

    if (inBox) {
      problems.push(`Zeile ${lineNo}: Tabellenzeile in einer Box übersprungen: ${line}`);
      return;
    }
    if (!currentSection || !currentSection.unit) {
      problems.push(`Zeile ${lineNo}: Vokabel ohne Unit/Abschnitt: ${line}`);
      return;
    }
    if (cells.length !== 3) {
      problems.push(`Zeile ${lineNo}: ${cells.length} statt 3 Spalten: ${line}`);
      return;
    }

    const [rawEn, de, hint] = cells;
    const irregular = rawEn.includes('*');
    const en = rawEn.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    if (!en || !de) {
      problems.push(`Zeile ${lineNo}: leeres Englisch- oder Deutsch-Feld: ${line}`);
      return;
    }

    const { example, notes } = splitHint(hint);
    const pair = findPair(en, hint);
    if (pair && (!pair.ae || !pair.be)) {
      problems.push(`Zeile ${lineNo}: BE/AE-Paar unvollständig (${JSON.stringify(pair)}): ${en}`);
    }
    if (example && !/[.!?…)"']$/.test(example)) {
      problems.push(`Zeile ${lineNo}: Beispiel endet nicht mit Satzzeichen – prüfen: "${example}"`);
    }

    const unitDoc = units.get(currentSection.unit);
    const entry = {
      id: `k6v${currentSection.unit}_${String(unitDoc.vocab.length + 1).padStart(3, '0')}`,
      grade: GRADE,
      unit: currentSection.unit,
      section: currentSection.section,
      sectionTitle: currentSection.sectionTitle,
      category: slugify(currentSection.section),
      type: detectType(en, pair),
      de,
      en
    };
    if (irregular) entry.irregular = true;
    if (pair) entry.pair = pair;
    if (example) entry.example = example;
    if (notes) entry.notes = notes;
    unitDoc.vocab.push(entry);
  });

  return { units, problems };
}

function main() {
  const markdown = fs.readFileSync(SOURCE, 'utf8');
  const { units, problems } = parseVocabulary(markdown);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const unitDoc of [...units.values()].sort((a, b) => a.unit - b.unit)) {
    const id = `k6u${unitDoc.unit}`;
    const outFile = path.join(OUT_DIR, `${id}.json`);
    const existing = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};

    const doc = {
      id,
      grade: GRADE,
      unit: unitDoc.unit,
      title: unitDoc.title,
      vocab: unitDoc.vocab,
      grammarTopics: existing.grammarTopics || [],
      grammarQuestions: existing.grammarQuestions || [],
      conversationScenarios: existing.conversationScenarios || []
    };
    fs.writeFileSync(outFile, JSON.stringify(doc, null, 2) + '\n');

    const bySection = {};
    for (const w of unitDoc.vocab) bySection[w.section] = (bySection[w.section] || 0) + 1;
    const sectionList = Object.entries(bySection).map(([s, n]) => `${s} ${n}`).join(', ');
    console.log(`${id}: ${unitDoc.vocab.length} Vokabeln (${sectionList})`);
  }

  const total = [...units.values()].reduce((sum, u) => sum + u.vocab.length, 0);
  console.log(`Gesamt: ${total} Vokabeln`);

  if (problems.length) {
    console.log(`\nNicht eindeutig geparst / bitte prüfen (${problems.length}):`);
    for (const p of problems) console.log('  - ' + p);
  } else {
    console.log('\nAlle Zeilen eindeutig geparst.');
  }
}

main();
