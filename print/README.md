# Printable editions

`pnpm print:editions` (`scripts/print-editions.ts`, task PM-61) writes the learning book and the course as A4 PDFs for teaching, with their HTML:
`book-zh-Hant.pdf` (《以模型讀中醫》) and `course-zh-Hant.pdf` (《中醫學系統課程》). They are derived from `docs/book/zh-Hant` and `docs/course/zh-Hant` —
the same blocks the app shows — and git-ignored like the review packs: regenerate them after a change to the texts.

- **Printing** uses the installed Chrome through Playwright (`channel: "chrome"`) and the system's Traditional Chinese fonts (Songti TC, Noto Serif TC … or
  PingFang TC, Heiti TC); nothing is downloaded. `--html` writes the HTML only.
- **Each edition** has a cover, the introduction with its contents, every chapter from a new page, the quotations with their sources, an outline of the
  headings, and on every page the work, its review status and the page number.
- **The review status** is the one the review records give ([content review](../docs/content-review.md) §5). While a text is a draft, its edition says so on
  the cover and on every page: it is for study within the project, not to be handed out as a reviewed text, and it is never medical advice.
