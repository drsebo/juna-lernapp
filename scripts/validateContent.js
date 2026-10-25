// Local dev tool — checks all bundled content JSON (grade 5 and grade 6) before
// it is pushed to Firestore with `npm run sync-content`.
//
// Usage: node scripts/validateContent.js   (or: npm run validate)
// Exits with code 1 if any error is found; warnings don't fail the run.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../src/data');
const MIN_QUESTIONS_PER_GRADE6_TOPIC = 12;

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

function listJson(dir) {
  const abs = path.join(DATA_DIR, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

function load(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, rel), 'utf8'));
  } catch (e) {
    err(rel, `ungültiges JSON (${e.message})`);
    return null;
  }
}

const isBlank = (v) => typeof v !== 'string' || v.trim() === '';

// IDs must be unique across every content file, because both grades end up in
// the same Leitner / grammar-progress maps keyed by id.
const seenIds = new Map();
function registerId(file, id, what) {
  if (isBlank(id)) {
    err(file, `${what} ohne id`);
    return;
  }
  if (seenIds.has(id)) err(file, `doppelte id "${id}" (schon in ${seenIds.get(id)})`);
  else seenIds.set(id, file);
}

function checkVocab(file, doc) {
  for (const w of doc.vocab || []) {
    registerId(file, w.id, 'Vokabel');
    if (isBlank(w.de)) err(file, `${w.id}: leeres "de"`);
    if (isBlank(w.en)) err(file, `${w.id}: leeres "en"`);
    if (!['word', 'phrase', 'pair'].includes(w.type)) err(file, `${w.id}: unbekannter type "${w.type}"`);
    if (w.unit !== doc.unit) err(file, `${w.id}: unit ${w.unit} passt nicht zur Datei (unit ${doc.unit})`);
    if (doc.grade === 6) {
      if (w.grade !== 6) err(file, `${w.id}: grade fehlt oder ist nicht 6`);
      if (isBlank(w.section)) err(file, `${w.id}: section fehlt`);
      if (!w.id.startsWith(`k6v${doc.unit}_`)) err(file, `${w.id}: id sollte mit "k6v${doc.unit}_" beginnen`);
      if (/\*/.test(w.en)) err(file, `${w.id}: Stern im "en" ("${w.en}")`);
      if (w.type === 'pair' && (!w.pair || isBlank(w.pair.be) || isBlank(w.pair.ae))) {
        err(file, `${w.id}: BE/AE-Paar ohne vollständiges "pair"`);
      }
    }
  }
}

function checkGrammar(file, doc) {
  const topicIds = new Set();
  for (const t of doc.grammarTopics || []) {
    registerId(file, t.id, 'Grammatikthema');
    topicIds.add(t.id);
    if (isBlank(t.code)) err(file, `${t.id}: code fehlt`);
    if (isBlank(t.title)) err(file, `${t.id}: title fehlt`);
    if (isBlank(t.explanation)) err(file, `${t.id}: explanation fehlt`);
    if (doc.grade === 6 && t.id !== `k6g_${t.code}`) err(file, `${t.id}: id sollte "k6g_${t.code}" sein`);
  }

  const perTopic = {};
  for (const q of doc.grammarQuestions || []) {
    registerId(file, q.id, 'Grammatikfrage');
    if (!topicIds.has(q.topicId)) err(file, `${q.id}: topicId "${q.topicId}" gibt es in dieser Unit nicht`);
    perTopic[q.topicId] = (perTopic[q.topicId] || 0) + 1;
    if (isBlank(q.prompt)) err(file, `${q.id}: prompt fehlt`);
    if (isBlank(q.answer)) err(file, `${q.id}: answer fehlt`);
    if (isBlank(q.explanation)) warn(file, `${q.id}: keine explanation`);

    if (q.type === 'multipleChoice') {
      if (!Array.isArray(q.options) || q.options.length < 2) err(file, `${q.id}: weniger als 2 options`);
      else {
        if (!q.options.includes(q.answer)) err(file, `${q.id}: answer "${q.answer}" ist nicht in options`);
        if (new Set(q.options).size !== q.options.length) err(file, `${q.id}: doppelte options`);
        for (const key of Object.keys(q.optionHints || {})) {
          if (!q.options.includes(key)) err(file, `${q.id}: optionHints-Schlüssel "${key}" ist keine option`);
          if (key === q.answer) err(file, `${q.id}: optionHints für die richtige Antwort`);
        }
        if (doc.grade === 6) {
          const missing = q.options.filter((o) => o !== q.answer && !(q.optionHints || {})[o]);
          if (missing.length) err(file, `${q.id}: optionHints fehlen für ${missing.map((m) => `"${m}"`).join(', ')}`);
        }
      }
    } else if (q.type === 'fillBlank' || q.type === 'transform') {
      if (q.options) warn(file, `${q.id}: ${q.type} mit options (werden ignoriert)`);
      if (q.type === 'fillBlank' && !q.prompt.includes('___')) {
        // grade 5 has a few whole-word prompts ("Ordnungszahl für 5:") that are fine as they are
        (doc.grade === 6 ? err : warn)(file, `${q.id}: fillBlank ohne "___" im prompt`);
      }
    } else {
      err(file, `${q.id}: unbekannter type "${q.type}"`);
    }

    if (q.acceptedAnswers !== undefined) {
      if (!Array.isArray(q.acceptedAnswers) || q.acceptedAnswers.some(isBlank)) err(file, `${q.id}: acceptedAnswers muss eine Liste nicht-leerer Strings sein`);
      else if (!q.acceptedAnswers.some((a) => a.toLowerCase() === q.answer.toLowerCase())) {
        err(file, `${q.id}: acceptedAnswers enthält die answer "${q.answer}" nicht`);
      }
    }
  }

  if (doc.grade === 6) {
    for (const id of topicIds) {
      if ((perTopic[id] || 0) < MIN_QUESTIONS_PER_GRADE6_TOPIC) {
        err(file, `${id}: nur ${perTopic[id] || 0} Fragen (mindestens ${MIN_QUESTIONS_PER_GRADE6_TOPIC})`);
      }
    }
  }
  return topicIds;
}

// Every node must be reachable from startNode, every "next" must exist, and
// from every reachable node some end node must still be reachable (otherwise
// the dialogue can get stuck in a loop).
function checkScenario(file, s) {
  registerId(file, s.id, 'Szenario');
  const nodes = s.nodes || {};
  const ids = Object.keys(nodes);
  if (!nodes[s.startNode]) {
    err(file, `${s.id}: startNode "${s.startNode}" existiert nicht`);
    return;
  }
  const endNodes = new Set(s.endNodes || []);
  for (const e of endNodes) if (!nodes[e]) err(file, `${s.id}: endNode "${e}" existiert nicht`);

  const isEnd = (id) => endNodes.has(id) || !(nodes[id].choices || []).length;
  for (const id of ids) {
    const node = nodes[id];
    if (isBlank(node.npcLine)) err(file, `${s.id}/${id}: npcLine fehlt`);
    for (const [i, ch] of (node.choices || []).entries()) {
      if (isBlank(ch.text)) err(file, `${s.id}/${id}: Antwort ${i + 1} ohne text`);
      if (!['good', 'ok', 'wrong'].includes(ch.quality)) err(file, `${s.id}/${id}: Antwort ${i + 1} mit quality "${ch.quality}"`);
      if (isBlank(ch.feedback)) warn(file, `${s.id}/${id}: Antwort ${i + 1} ohne feedback`);
      if (!nodes[ch.next]) err(file, `${s.id}/${id}: Antwort ${i + 1} zeigt auf fehlenden Knoten "${ch.next}"`);
    }
  }

  const reachable = new Set();
  const stack = [s.startNode];
  while (stack.length) {
    const id = stack.pop();
    if (reachable.has(id) || !nodes[id]) continue;
    reachable.add(id);
    if (!isEnd(id)) for (const ch of nodes[id].choices) stack.push(ch.next);
  }
  for (const id of ids) if (!reachable.has(id)) err(file, `${s.id}: Knoten "${id}" ist nicht erreichbar`);
  if (![...reachable].some(isEnd)) err(file, `${s.id}: kein Ende erreichbar`);

  // nodes that can still reach an end, computed backwards
  const canFinish = new Set(ids.filter(isEnd));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of ids) {
      if (canFinish.has(id)) continue;
      if ((nodes[id].choices || []).some((ch) => canFinish.has(ch.next))) {
        canFinish.add(id);
        changed = true;
      }
    }
  }
  for (const id of reachable) if (!canFinish.has(id)) err(file, `${s.id}: von Knoten "${id}" aus kommt man nie zu einem Ende`);
}

function checkUnitFile(file, doc) {
  if (typeof doc.unit !== 'number') err(file, 'Feld "unit" fehlt');
  if (isBlank(doc.title)) err(file, 'Feld "title" fehlt');
  if (file.startsWith('grade6') && doc.grade !== 6) err(file, 'Feld "grade: 6" fehlt');
  checkVocab(file, doc);
  const topicIds = checkGrammar(file, doc);
  for (const s of doc.conversationScenarios || []) checkScenario(file, s);
  return topicIds;
}

function checkIrregularVerbs(file, list, { needsParticiple }) {
  if (!Array.isArray(list) || !list.length) {
    err(file, 'keine irregularVerbs');
    return;
  }
  for (const v of list) {
    registerId(file, v.id, 'Verb');
    for (const field of ['infinitive', 'simplePast', 'de', ...(needsParticiple ? ['pastParticiple'] : [])]) {
      if (isBlank(v[field])) err(file, `${v.id}: leeres "${field}"`);
    }
  }
}

function main() {
  const unitFiles = [...listJson('units'), ...listJson('grade6').filter((f) => /\/k6u\d+\.json$/.test(f))];
  const grade6Vocab = new Map();
  const grade6Codes = new Set();
  const grade6Sections = new Map(); // unit → Set(section)
  let counts = { vocab: 0, topics: 0, questions: 0, scenarios: 0 };

  for (const file of unitFiles) {
    const doc = load(file);
    if (!doc) continue;
    checkUnitFile(file, doc);
    counts.vocab += (doc.vocab || []).length;
    counts.topics += (doc.grammarTopics || []).length;
    counts.questions += (doc.grammarQuestions || []).length;
    counts.scenarios += (doc.conversationScenarios || []).length;
    if (doc.grade === 6) {
      for (const w of doc.vocab || []) grade6Vocab.set(w.id, w);
      for (const t of doc.grammarTopics || []) grade6Codes.add(t.code);
      grade6Sections.set(doc.unit, new Set((doc.vocab || []).map((w) => w.section)));
    }
  }

  const grade5Verbs = load('irregularVerbs.json');
  if (grade5Verbs) checkIrregularVerbs('irregularVerbs.json', grade5Verbs.irregularVerbs, { needsParticiple: false });

  const verbsFile = 'grade6/irregularVerbs6.json';
  if (fs.existsSync(path.join(DATA_DIR, verbsFile))) {
    const verbs6 = load(verbsFile);
    if (verbs6) {
      checkIrregularVerbs(verbsFile, verbs6.irregularVerbs, { needsParticiple: true });
      const grade5Ids = new Set(((grade5Verbs && grade5Verbs.irregularVerbs) || []).map((v) => v.id));
      for (const v of verbs6.irregularVerbs || []) {
        if (v.grade5Id && !grade5Ids.has(v.grade5Id)) err(verbsFile, `${v.id}: grade5Id "${v.grade5Id}" gibt es nicht`);
        for (const vid of v.vocabIds || []) if (!grade6Vocab.has(vid)) err(verbsFile, `${v.id}: vocabId "${vid}" gibt es nicht`);
      }
      const covered = new Set((verbs6.irregularVerbs || []).flatMap((v) => v.vocabIds || []));
      for (const w of grade6Vocab.values()) {
        if (w.irregular && !covered.has(w.id)) warn(verbsFile, `unregelmäßiges Verb "${w.en}" (${w.id}) fehlt in der Verbliste`);
      }
    }
  } else {
    err(verbsFile, 'Datei fehlt');
  }

  const goalsFile = 'grade6/learningGoals6.json';
  if (fs.existsSync(path.join(DATA_DIR, goalsFile))) {
    const goals = load(goalsFile);
    if (goals) {
      for (const g of goals.learningGoals || []) {
        registerId(goalsFile, g.id, 'Lernziel');
        if (isBlank(g.text)) err(goalsFile, `${g.id}: leerer text`);
        if (!grade6Sections.has(g.unit)) err(goalsFile, `${g.id}: unit ${g.unit} gibt es nicht`);
        for (const code of g.grammarCodes || []) if (!grade6Codes.has(code)) err(goalsFile, `${g.id}: G-Code "${code}" gibt es nicht`);
        const sections = grade6Sections.get(g.unit) || new Set();
        for (const s of g.vocabSections || []) if (!sections.has(s)) err(goalsFile, `${g.id}: Abschnitt "${s}" gibt es in Unit ${g.unit} nicht`);
      }
      for (const s of goals.skills || []) if (isBlank(s.code) || isBlank(s.title)) err(goalsFile, 'Skill ohne code/title');
    }
  } else {
    err(goalsFile, 'Datei fehlt');
  }

  for (const f of listJson('grade6')) {
    if (!/\/(k6u\d+|irregularVerbs6|learningGoals6|examTasks6)\.json$/.test(f)) warn(f, 'unbekannte Datei – wird nicht geprüft');
  }

  // The index decides what the app loads and what sync-content uploads, so
  // every content file has to be in it (and every entry has to exist).
  const indexFile = 'contentIndex.json';
  const index = load(indexFile);
  if (index) {
    const listed = new Set();
    for (const entry of index.documents || []) {
      registerId(indexFile, `index:${entry.id}`, 'Index-Eintrag');
      if (!fs.existsSync(path.join(DATA_DIR, entry.file || ''))) err(indexFile, `${entry.id}: Datei "${entry.file}" fehlt`);
      if (!(index.grades || []).includes(entry.grade)) err(indexFile, `${entry.id}: grade ${entry.grade} steht nicht in "grades"`);
      if (!['unit', 'irregularVerbs', 'learningGoals', 'examTasks'].includes(entry.kind)) err(indexFile, `${entry.id}: unbekannte kind "${entry.kind}"`);
      listed.add(entry.file);
    }
    for (const f of [...listJson('units'), ...listJson('grade6'), 'irregularVerbs.json']) {
      if (!listed.has(f)) err(indexFile, `"${f}" fehlt im Index – wird weder geladen noch synchronisiert`);
    }
  }

  console.log(`Geprüft: ${unitFiles.length} Unit-Dateien, ${counts.vocab} Vokabeln, ${counts.topics} Grammatikthemen, ${counts.questions} Fragen, ${counts.scenarios} Szenarien, ${seenIds.size} IDs.`);
  if (warnings.length) {
    console.log(`\n${warnings.length} Warnung(en):`);
    for (const w of warnings) console.log('  ⚠ ' + w);
  }
  if (errors.length) {
    console.log(`\n${errors.length} Fehler:`);
    for (const e of errors) console.log('  ✗ ' + e);
    process.exit(1);
  }
  console.log('\nKeine Fehler gefunden.');
}

main();
