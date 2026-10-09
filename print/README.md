# Printable editions

Two scripts print A4 PDFs, with their HTML, from what the app shows. The outputs are derived and git-ignored like the review packs: regenerate them after a change to the texts or the data.

- **`pnpm print:editions`** (`scripts/print-editions.ts`, task PM-61) prints the learning book and the course for teaching: `book-zh-Hant.pdf` (《以模型讀中醫》) and
  `course-zh-Hant.pdf` (《中醫學系統課程》), from `docs/book/zh-Hant` and `docs/course/zh-Hant` — the same blocks the app shows. Each has a cover, the introduction with its
  contents, every chapter from a new page, and the quotations with their sources.
- **`pnpm print:herbs`** (`scripts/print-herbs.ts`, task PM-62) prints the herb handbook 《中藥速查手冊》 — a quick dictionary of the knowledge base's 703 herbs — in each
  language of the app: `herbs-zh-Hant.pdf`, `herbs-zh-Hans.pdf` (《中药速查手册》) and `herbs-en.pdf` (*Chinese Herbs: A Quick Reference*).
  - **Each entry** is what the herb's page in Learn shows. First come the record's flags: toxicity with its grade, pregnancy, interactions, the source's caution, and the herbs
    十八反 and 十九畏 say not to combine it with. Then the category, nature, flavours, channels, functions and part used. Then the property model's reading: 陰陽 and 升降 on a
    scale, the five phases in per cent, 補瀉, 潤燥 and 氣血 in words. Last, its 七情, 引經 and 量效 where recorded, its formulas and its source.
  - **Order:** by category as a textbook lists them, numbered.
  - **The part on formulas** (task PM-63) follows the herbs. It opens by explaining how a formula is built and read: 君臣佐使 in the words of 《素問·至真要大論》 and in plain
    language; the reasoning (方解); 加減 — 隨證 (《傷寒論》), its three kinds, 三因制宜 with the 素問's passages, and how the app's model does it. Then come the library's 33
    formulas, by school, laid out as a formula textbook does: the cautions first (pregnancy, interactions, tier B or C with its reasons), then 功用, 主治, 組成 by role with
    what each herb does (linked to its entry; a toxic herb marked with its grade), 方解, the classic's own words and the classical 加減 (signs, herbs added, the formula it makes,
    its book).
  - **The quantities of a formula** (task PM-64): each herb's share, which the app's formula page gives every reader; and for the 9 經方 the original text's amounts in its
    own units (麻黃 3 兩, 杏仁 70 個, 大棗 13 枚), with the note on amounts beside the table. The original amounts belong to the study reference: like the 33 formulas, they
    are printed where the build gives the study reference to every reader (PD-30). There are no grams.
  - **The appendices:** indexes by pinyin, by stroke count (the Traditional edition), by Latin and English name; the herbs by nature, flavour and channel; the safety
    lists; the 七情 table; 引經報使; 炮製; 量效; the rules of the property model; the glossary; and the works it draws on.
  - **A herb entry gives no amount**, as on a herb page.
- **`pnpm print:herbs:study`** (`--study`, task PM-64) prints the **study edition** 《中藥速查手冊（學習版）》: `herbs-study-zh-Hant.pdf`, `herbs-study-zh-Hans.pdf` and
  `herbs-study-en.pdf`. It is the standard edition with the study reference in print (PD-30), which is what the app shows a learner:
  - **each formula's reference grams** beside the shares and the classical amounts (桂枝 20% · 3 兩 · 約 9 克), and the grams of the herbs a classical 加減 adds;
  - **each herb's range** from its source entry (【參考份量】3–10 克（中國藥典（2025年版）一部）), for 589 herbs;
  - **never a gram for a toxic herb**: the 83 toxic herbs with a range say instead that a practitioner decides, and so do the 10 rows of formulas that hold one (半夏, 杏仁,
    附子);
  - **the note on amounts** (N-AMOUNTS) at the front and beside every table of quantities. The cover, the title and every page say it is the study edition and that its
    quantities are not instructions for taking medicine.

  It is printed only on request, and only where the build serves the study reference (`dose_display` not `off`). A public build serves none before the review (`check-release`
  rule 18), and the script then refuses. The study edition is a draft until the pharmacy and TCM clinical reviews of the formulas, the herb records and the reference
  quantities. It is for study within the project and is never to be handed out.
- **Printing** uses the installed Chrome through Playwright (`channel: "chrome"`) and the system's Chinese fonts (Songti and PingFang, TC or SC); nothing is downloaded. `--html`
  writes the HTML only. Every PDF has an outline of the headings and, on every page, the work, its review status and the page number.
- **The review status** is the one the review records give ([content review](../docs/content-review.md) §5). While a text is a draft, its edition says so on the cover and on
  every page. It is for study within the project, not to be handed out as a reviewed text, and it is never medical advice. The handbook is reviewed only when everything it
  prints is: every herb and formula record and table row, the safety rules, the glossary, and its words (`handbook`, `learn`, `formula`, `report` and `safety` in
  `apps/web/src/i18n`).
- **The reader** the handbook prints for is the closed beta's default reader: a learner, who reads with the study reference where the build serves it to every reader
  (PD-30). A learner sees every formula and the classical 加減. The standard edition prints no modern quantity; the study edition prints a learner's.
