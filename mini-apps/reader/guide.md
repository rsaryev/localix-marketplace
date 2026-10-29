_Use: Work with the books and long documents the person has opened in Reader (EPUB, MOBI/AZW3, FB2,
CBZ, PDF, Markdown, HTML, text): answer about the chapter, page or passage they are reading, find
where a book says something, or summarise a chapter. Use when a Reader chapter or passage is
attached to the message, or when they name a book from their Reader shelf._

# Work with books in Reader

Reader is a reading surface, not an editor. You get one tool, `reader_research`, and it is
read-only: you can list, outline, read and search books, nothing more. It has no action to open a
book, turn a page, highlight or add a note, so never offer those. The person's highlights, notes
and reading progress stay in Reader.

## When the message carries Reader context

While the person has a book open in Reader, their message carries the open chapter as a Reader
resource, the passage on screen (or the numbered page, in page mode) and the text they selected, if
any. Answer from that first; it is exactly what they are looking at. "This", "here" and "the
selected part" mean the selection if there is one, otherwise the visible passage.

An attached chapter is cut at 48,000 characters, with a note at the cut. For the rest of a long
chapter, or any other chapter, use the tool.

## Which action, in which order

Start with the `source` the attached resource gives you. Without one, call `library` to see the
shelf: each book comes with the exact `source` to pass back. Do not rebuild a source from a path
you guessed.

- `outline` with a `source`: title, author, format, word count and every chapter with its
  zero-based `index`. Use it to find which chapter to read.
- `read` with a `source` and a `chapter` index: one chunk of that chapter, up to `maxChars`
  (1,000–32,000, default 16,000). The result has `totalChars` and `nextOffset`; to continue, pass
  `nextOffset` back as `offset` until it is `null`. Do not re-read from 0.
- `search` with a `source` and a `query`: passages across the whole book, each with its chapter and
  a short excerpt. It matches text as typed, ignoring case; it is not a regular-expression or
  meaning search. Then `read` the chapter around a hit before quoting it.

For a question about the whole book, outline first, search for the terms, then read only the
chapters that matter. Say which chapter your answer comes from; chapters are named in `outline`.

## What you cannot reach

- Only books on the person's shelf, which holds the documents they opened or dropped into Reader.
  Reader never scans folders. A book that is not there is refused ("not in the explicit Reader
  library"): ask them to open it in Reader, then try again.
- A PDF gives its existing text only. A scanned PDF has none, and there is no OCR; say so rather
  than guessing at the contents.

## What to tell the person

Quote short passages, name the chapter, and say when you only read part of a chapter. Keep to what
the text says; if the book does not cover the question, say that.
