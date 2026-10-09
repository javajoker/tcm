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
  - **The appendices:** indexes by pinyin, by stroke count (the Traditional edition), by Latin and English name; the herbs by nature, flavour and channel; the safety
    lists; the 七情 table; 引經報使; 炮製; 量效; the rules of the property model; the glossary; and the works it draws on.
  - **Nothing about amounts**, as on a herb page.
- **Printing** uses the installed Chrome through Playwright (`channel: "chrome"`) and the system's Chinese fonts (Songti and PingFang, TC or SC); nothing is downloaded. `--html`
  writes the HTML only. Every PDF has an outline of the headings and, on every page, the work, its review status and the page number.
- **The review status** is the one the review records give ([content review](../docs/content-review.md) §5). While a text is a draft, its edition says so on the cover and on
  every page. It is for study within the project, not to be handed out as a reviewed text, and it is never medical advice. The handbook is reviewed only when everything it
  prints is: every herb record and table row, the safety rules, the glossary, and its words (`handbook`, `learn` and `formula` in `apps/web/src/i18n`).
