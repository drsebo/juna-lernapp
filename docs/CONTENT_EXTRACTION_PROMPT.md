# Prompt: Buch-Screenshots → Lernapp-Content-Datei

Diesen Text (inkl. Schema) zusammen mit Fotos/Screenshots der Buchseiten in
eine neue Claude-Unterhaltung einfügen. Am Ende soll eine fertige `unitN.json`
herauskommen, die dem Schema der Lernapp entspricht.

---

Du hilfst mir, Lerninhalte aus Fotos eines Schulbuchs (Englisch, Klasse 5/6)
in eine strukturierte JSON-Datei für meine Lern-App umzuwandeln. Halte dich
exakt an das folgende Schema — es wird 1:1 von der App eingelesen.

## Schema

```jsonc
{
  "unit": 5,
  "title": "Let's go shopping",
  "vocab": [
    {
      "id": "v5_001",
      "unit": 5,
      "category": "shopping-words",   // gruppiert Wörter für themenbezogene Sessions
      "type": "word",                 // "word" | "phrase" | "pair" (BE/AE)
      "de": "einkaufen gehen",
      "en": "to go shopping",
      "ipa": "gəʊ ˈʃɒpɪŋ",
      "example": "We go shopping on Saturday.",  // optional, aber empfohlen für Wörter (nicht bei Phrasen nötig)
      "notes": ""                     // optional
    }
  ],
  "grammarTopics": [
    {
      "id": "g5_28",
      "unit": 5,
      "code": "G28",                  // die Nummer/Bezeichnung genau wie im Buch (z.B. "G28", "G32-33", "Check-in")
      "title": "some / any / no",
      "explanation": "some: positive Sätze ... any: Fragen und negative Sätze ... no: statt not...any",
      "examples": ["I've got some money.", "Have you got any money?", "I've got no money."],
      "commonMistakes": ["some in Fragen statt any verwenden"]
    }
  ],
  "grammarQuestions": [
    {
      "id": "q5_g28_001",
      "topicId": "g5_28",             // muss auf eine existierende grammarTopics[].id verweisen
      "type": "multipleChoice",       // "multipleChoice" | "fillBlank"
      "prompt": "I've got ___ apples.",
      "options": ["some", "any", "no"],   // nur bei multipleChoice
      "answer": "some",
      "explanation": "Positiver Satz → some.",
      "optionHints": {                // optional, aber empfohlen bei multipleChoice: gezielter Hinweis pro falscher Option
        "any": "Fast richtig! \"any\" benutzt man in Fragen und Verneinungen — dieser Satz ist aber positiv."
      }
    }
  ],
  "conversationScenarios": [
    {
      "id": "c5_market",
      "unit": 5,
      "title": "Im Laden / Auf dem Markt",
      "level": 2,                      // 1-3 Sterne (Schwierigkeit)
      "goal": "Einkaufsvokabular, Mengenangaben, Höflichkeit",
      "startNode": "n1",
      "nodes": {
        "n1": {
          "npcLine": "Good morning! Welcome to the market. What can I do for you today?",
          "choices": [
            {
              "text": "I'm looking for a present for my mum.",
              "quality": "good",       // "good" | "ok" | "wrong" — steuert nur den Ton des Feedbacks, blockiert nie den Fortschritt
              "feedback": "Perfekt – höflich und klar.",
              "next": "n2"
            }
          ]
        }
      },
      "endNodes": ["n4"]               // Knoten ohne choices (oder hier gelistet) beenden das Szenario
    }
  ]
}
```

## Regeln

- `id`-Präfixe: `v{unit}_`, `g{unit}_`, `q{unit}_`, `c{unit}_` (fortlaufend nummeriert, 3-stellig bei vocab/questions, z.B. `v5_001`, `v5_002`).
- **Reihenfolge ist wichtig**: `vocab` und `grammarTopics` müssen in der Reihenfolge stehen, in der sie im Buch vorkommen — die App zählt "bis zu Wort X" / "bis zu Grammatik-Code X" anhand dieser Array-Reihenfolge, nicht nach ID-Nummer.
- `grammarTopics[].code` muss exakt der Bezeichnung im Buch entsprechen (z.B. "G30"), da die App-Nutzerin genau diesen Code als Fortschritts-Referenz einträgt.
- `vocab[].example` bei `type: "word"` ergänzen (ein kurzer, natürlicher Beispielsatz) — bei `type: "phrase"` nicht nötig, da die Phrase selbst schon das Beispiel ist.
- Grammatik-Erklärungen und `commonMistakes` auf Deutsch, da die Nutzerin (11 Jahre) auf Deutsch lernt.
- Bei `optionHints`: nicht einfach nur "falsch" sagen, sondern kurz erklären, warum die gewählte Option nicht passt UND was der Unterschied zur richtigen Antwort ist.
- Ton bei `conversationScenarios`-Feedback: ermutigend, nie bloßstellend — auch bei `"quality": "wrong"` einen konstruktiven, freundlichen Hinweis geben.
- Gib am Ende ausschließlich die fertige JSON-Datei aus (ggf. in Abschnitten, wenn sehr lang), keine zusätzliche Erklärung drumherum, damit ich sie direkt als `unitN.json` speichern kann.

## Was ich dir gebe

Fotos/Screenshots der Buchseiten (Vokabellisten, Grammatik-Kästen, ggf.
Dialoge/Rollenspiele). Frag nach, falls eine Abbildung unleserlich ist oder
Kontext fehlt (z.B. zu welcher Unit/welchem Kapitel die Seite gehört),
anstatt zu raten.
