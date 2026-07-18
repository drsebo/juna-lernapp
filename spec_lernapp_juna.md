# Spec: English Learning PWA for Juna — Handoff to Claude Code

## 1. Overview

A Progressive Web App (PWA) for practising English, usable offline on iPad/iPhone/Mac. Covers **grammar**, **vocabulary**, and **conversation** practice, plus a dedicated **exam prep mode**. Built to scale beyond Grade 5 into Grade 6 as more units are added later.

**Prototype scope (v1):** Unit 5 (*Let's go shopping*) and Unit 6 (*It's my party!*) content only, bundled directly into the app.

---

## 2. Tech Stack

- **PWA**: plain HTML/CSS/JS, installable on iOS home screen, works offline
- **Storage**: browser local storage only for v1 (no cloud sync yet — noted as a future phase, not built now)
- **OCR**: offline-capable OCR library for the exam-prep photo feature (evaluate options such as Tesseract.js running fully client-side — no external API calls, no internet dependency)
- **Content**: Unit 5 & 6 grammar/vocab/conversation content bundled directly into the app's source/data files at build time. A manual **file upload button** lets the user add future units (new `.md` files) later without a rebuild.

---

## 3. Home Screen

Style: **playful but mature** — clean minimalist icons, not cartoonish. Card-based layout.

- Top: **streak counter** + **overall progress bar**
- Four main cards:
  1. **Grammar**
  2. **Vocabulary**
  3. **Conversations**
  4. **Exam Prep** — greyed out / disabled unless an active exam has been set up
- Secondary option: **"Study weak points"** (pulls from Leitner box 1 items across grammar + vocab)

---

## 4. Session Flow (Grammar & Vocabulary)

At the **start of each session**, the user states their current position in the book, separately for:
- **Grammar** progress (e.g. "Unit 5.5")
- **Vocabulary** progress (e.g. "Unit 5")

**Content selection logic:**
- ~70% of questions from the most recent unit/topic
- ~30% randomly pulled from earlier units, to test retention

**Session customisation (user sets before starting):**
- Vocabulary: choose *number of words* to review
- Grammar: choose *number of topics* to cover
- OR set a **time limit** instead

**Timer behaviour:**
- At the time limit, show a gentle notification ("You've reached your 15 minutes — nice work!")
- Offer an option to **extend by 5 minutes**
- Log each extension (useful for progress/motivation tracking)

---

## 5. Vocabulary: Leitner Box System

Four boxes per vocabulary word, tracked individually:

| Box | Meaning | Asked... |
|-----|---------|----------|
| 1 | New / just got wrong | Most often |
| 2 | Correct once | Less often |
| 3 | Correct twice in a row | Even less often |
| 4 | Mastered | Rarely / not asked |

**Rules:**
- Correct answer → move up one box (1→2→3→4)
- Wrong answer → move **down one box** (not back to Box 1) — e.g. Box 3 → Box 2
- "Study weak points" mode pulls primarily from Box 1

---

## 6. Conversations

Uses vocabulary + grammar from the **most recent unit** as the primary pool, with occasional older words/structures mixed in to check retention — same recency-weighted logic as grammar/vocab sessions.

Text-based (not speech-to-speech) — speech interaction happens separately, outside this app.

---

## 7. Exam Prep Mode

**Trigger:** User photographs a **machine-printed** exam prep sheet from school.

**Flow:**
1. Photo taken within the app
2. Offline OCR extracts the topic list from the image
3. Extracted topics are matched against the existing Unit 5/6 grammar & vocabulary content files
4. A **separate exam log** is created (with timestamp) tracking:
   - Which topics are covered / still open
   - % completion of exam prep (e.g. "3 of 10 topics done — 30%")
5. Exam Prep card on the home screen becomes active and shows this progress
6. Once no active exam is set, the Exam Prep card returns to its greyed-out/disabled state

This is a **separate progress track** from regular ongoing learning — it doesn't affect the Leitner boxes or general unit progress, though it draws on the same content.

---

## 8. Data Persistence

- **Local storage only for v1** (no cloud/iCloud/Dropbox sync in this phase)
- Data persists between sessions on the same device:
  - Leitner box state per vocabulary word
  - Grammar topic mastery/progress
  - Current book position (grammar & vocabulary, tracked separately)
  - Streak count
  - Exam log(s) with per-topic completion status
- **Future phase (not built now):** cross-device sync, likely via a lightweight cloud backend (e.g. Firebase/Supabase) rather than direct iCloud/Dropbox file access, since a Safari-based PWA cannot read/write iCloud Drive or Dropbox folders directly.

---

## 9. Content Source (v1 Prototype)

Bundle the following existing project content into the app's data layer:
- Unit 5 vocabulary & grammar (*some/any/no*, quantifiers, shopping vocabulary)
- Unit 6 vocabulary & grammar (modal verbs *can/can't/must/mustn't/needn't*, Simple Past, dates/ordinals, party vocabulary)
- Conversation scenarios relevant to Units 5–6 (market, café, birthday party, party rules)

Future units get added via the manual upload button, without needing a rebuild.

---

## 10. Open / Future Phases (explicitly out of scope for v1)

- Cross-device cloud sync
- Native iOS app / true iCloud Drive integration
- Online OCR fallback (if offline OCR proves insufficient)
- Grade 6 content (structure should anticipate this, but content itself comes later)
