# Content data schema

Defines the shape of `src/data/units/unitN.json` and `src/data/irregularVerbs.json`.
This is also the schema future manually-uploaded unit files must follow (spec §2/§9 — the
upload button that adds units without a rebuild expects a file in this exact shape).

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
