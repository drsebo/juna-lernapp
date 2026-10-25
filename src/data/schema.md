# Content data schema

Defines the shape of `src/data/units/unitN.json` and `src/data/irregularVerbs.json`.
Future units must follow this same shape — add a new `unitN.json` file here, then push it
to Firestore with `npm run sync-content` (see `scripts/syncContent.js`).

## Unit file (`unitN.json`)

```jsonc
{
  "unit": 5,
  "title": "Let's go shopping",
  "vocab": [
    {
      "id": "v5_001",
      "unit": 5,
      "category": "shopping-words",   // groups words for topic-scoped sessions
      "type": "word",                 // "word" | "phrase" | "pair" (BE/AE)
      "de": "einkaufen gehen",
      "en": "to go shopping",
      "ipa": "gəʊ ˈʃɒpɪŋ",
      "notes": ""                     // optional usage note
    }
  ],
  "grammarTopics": [
    {
      "id": "g5_28",
      "unit": 5,
      "code": "G28",
      "title": "some / any / no",
      "explanation": "some: positive Sätze ... any: Fragen und negative Sätze ... no: statt not...any",
      "examples": ["I've got some money.", "Have you got any money?", "I've got no money."],
      "commonMistakes": ["some in Fragen statt any verwenden"]
    }
  ],
  "grammarQuestions": [
    {
      "id": "q5_g28_001",
      "topicId": "g5_28",
      "type": "multipleChoice",       // "multipleChoice" | "fillBlank"
      "prompt": "I've got ___ apples.",
      "options": ["some", "any", "no"],   // only for multipleChoice
      "answer": "some",
      "explanation": "Positiver Satz → some."
    }
  ],
  "conversationScenarios": [
    {
      "id": "c5_market",
      "unit": 5,
      "title": "Im Laden / Auf dem Markt",
      "level": 2,                      // 1-3 stars
      "goal": "Einkaufsvokabular, Mengenangaben, Höflichkeit",
      "startNode": "n1",
      "nodes": {
        "n1": {
          "npcLine": "Good morning! Welcome to the market. What can I do for you today?",
          "choices": [
            {
              "text": "I'm looking for a present for my mum.",
              "quality": "good",
              "feedback": "Perfekt – höflich und klar.",
              "next": "n2"
            },
            {
              "text": "Give me a present.",
              "quality": "wrong",
              "feedback": "Zu direkt/unhöflich fürs Englische — besser 'I'm looking for...' oder 'Can I have...'.",
              "next": "n2"
            }
          ]
        }
      },
      "endNodes": ["n4"]
    }
  ]
}
```

## `irregularVerbs.json`

```jsonc
{
  "irregularVerbs": [
    { "id": "iv_001", "infinitive": "be", "simplePast": "was / were", "de": "sein" }
  ]
}
```

## Notes

- `id` prefixes: `v{unit}_`, `g{unit}_`, `q{unit}_`, `c{unit}_`, `iv_` (shared, unit-agnostic).
- `grammarQuestions[].topicId` must reference an existing `grammarTopics[].id`.
- Conversation `nodes` form a directed graph; a node with no `choices` (or listed in `endNodes`)
  ends the scenario. `quality` drives feedback tone (`good` | `ok` | `wrong`) but never blocks
  progress — every choice has a `next`, per the "correct gently, don't stop the flow" guidance.
- Vocab `category` values are free strings used purely for topic-scoped session filtering; they
  don't need to be enumerated anywhere else.

## Grade 6 (`src/data/grade6/`)

Same unit shape as above, with these additions. Grade 6 also has a "Unit 5" and "Unit 6", so
every grade 6 id carries a `k6` prefix to stay unique next to the grade 5 ids.

- `k6uN.json` (N = 1–6): `id: "k6uN"`, `grade: 6`. `vocab` is generated from
  `../C_Vokabeln/vokabeln.md` by `npm run build-grade6` (re-run after editing the list — it only
  replaces `vocab`, the hand-written grammar and scenarios stay). Grammar and scenarios are
  edited directly in the JSON.
- Vocab: `id: "k6v1_001"`, `grade: 6`, `section` ("Check-in", "Station 1", "Focus 1" …),
  `sectionTitle`, `category` (slug of `section`), optional `irregular: true` (marked * in the
  book), `pair: { be, ae }` for `type: "pair"`, `example`, `notes` (⚠️ hints, word families).
  Focus / Across cultures words belong to the unit before them. Array order = book order.
- Grammar topics: `id: "k6g_G1"`, `code: "G1"`, `bookPages`. Questions: `id: "k6q_G1_001"`,
  optional `acceptedAnswers: [...]` (all answers that count as correct, incl. `answer`).
- Scenarios: `id: "k6c_…"`, `grade: 6`, optional `section`, `situation`, `openingLine`,
  `grammarCodes`, `phrases`.
- `irregularVerbs6.json`: all grade 5 verbs plus the grade 6 *-verbs, each with
  `pastParticiple`, `introducedIn` (5 | 6), `grade5Id` / `vocabIds` links.
- `learningGoals6.json`: `learningGoals` ("Can you …" per unit, with `grammarCodes` and
  `vocabSections`) and `skills` (S1–S30).

## Content index (`contentIndex.json`)

Lists every content document with its Firestore id, `grade`, `kind` (`unit` | `irregularVerbs` |
`learningGoals` | `examTasks`) and bundled `file`. `npm run sync-content` uploads exactly these
documents plus the index itself (as `content/index`); the app loads one grade at a time from it
(`loadContent({ grade })`, default: the grade picked on Home). A new content file must be added
here, or it is neither loaded nor synced — `npm run validate` checks that.

Check everything with `npm run validate` before syncing.
