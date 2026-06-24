# v3.1 — References fix, compact writing UI, library Read, Cover Studio author name, stable Reading View

Six focused fixes to address the current broken behaviors and space issues.

## 1. Rebuild references so they behave like real chapter citations

Replace the current plain `<sup>[n]</sup>` insertion with a real reference marker tied to a stored reference record.

Implementation:
- Add a Tiptap inline mark/node for references that stores at least:
  - `refId`
  - `label`
  - `kind` (`footnote` / `endnote`)
- Update the Insert Reference dialog so saving a reference:
  - creates the DB record
  - inserts the structured reference marker at the cursor
  - preserves the marker during edits
- Make markers render correctly inside chapter content instead of being disconnected from the saved citation list.
- Add reference editing/removal support from the chapter sidebar or dialog list so references can be corrected after insertion.

Result:
- references work like chapter synopsis metadata does: saved, reusable, and kept in sync with the chapter
- exports and reading view can reliably map chapter markers to the correct citation

## 2. Improve “Generate with AI” for references and add footer references

The current AI citation flow only formats a user string into one line. It needs to produce cleaner, more usable references.

Implementation:
- Upgrade the citation prompt so AI returns structured fields:
  - citation text
  - best-guess URL if present
  - optional source title / author / year when inferable
- Prefill the citation and URL fields from that structured result instead of only a raw string.
- Add validation so empty/bad AI output does not insert broken references.
- Show a chapter-level references footer under the editor content for footnotes.
- In reading/export, render footnotes as a footer block tied to that chapter, and endnotes in the final References section.

Result:
- references added by AI are much more accurate and usable
- users can see the chapter’s reference footer immediately while editing

## 3. Add Read action in the Library next to Delete

Each book card gets a visible Read action alongside the existing delete flow.

Implementation:
- Add a Read icon/button on `BookCard`, near the delete control.
- Link it directly to `/book/$bookId/read`.
- Keep the card click opening the editor, while Read opens the reading experience.

Result:
- books can be opened in reader mode directly from the Library

## 4. Move author name out of AI Providers and into Cover Studio / book metadata

Author name should not live inside provider settings.

Implementation:
- Move author name from `AppSettings.authorName` to book-level metadata, e.g. `Book.authorName?`.
- Add author name editing prominently in Cover Studio.
- Use that per-book author name for:
  - cover rendering
  - title page
  - copyright page
  - exports
  - reading view
- Remove the Author name field from `/settings/ai`.
- Backfill existing books by copying the old global author name into the selected/current book when missing.

Result:
- author identity belongs to the book, not provider configuration
- different books can have different author names if needed

## 5. Compact the writing workspace for more usable space

When a book is open, the UI should favor writing area over navigation chrome.

Implementation:
- Make `Shell` support a compact/icon-only mode for `/book/$bookId` and `/book/$bookId/read`.
- Collapse the main app nav to icons with tooltips on those routes.
- Shrink the book’s chapter rail so chapters show primarily numbers by default.
- Keep title/details on hover, active item, or optional expand toggle.
- Reduce fixed widths in the editor layout so the writing column gets more room.

Result:
- more horizontal space for writing
- less visual clutter while editing

## 6. Fix Reading View so it actually opens reliably

The current reader likely hangs during pagination/layout of full HTML content.

Implementation:
- Add explicit reader loading and error states.
- Refactor pagination so it does not block on one giant synchronous layout pass.
- Paginate incrementally per section/chapter, caching results by `bookId + fontSize + mode`.
- Make the paginator more robust for complex chapter HTML, images, empty pages, and large books.
- Add a safe fallback mode:
  - if page measurement fails or times out, render a simple continuous reading layout instead of hanging forever
- Keep cover, front matter, chapters, footnotes, back matter, and references in order.

Result:
- reader opens consistently instead of sitting on a loading state or freezing
- large books remain usable

## Technical details

Files likely touched:
- `src/routes/book.$bookId.tsx`
- `src/routes/book.$bookId.read.tsx`
- `src/routes/index.tsx`
- `src/routes/cover-studio.tsx`
- `src/routes/settings.ai.tsx`
- `src/components/app/Shell.tsx`
- `src/lib/db.ts`
- `src/lib/references.ts`
- `src/lib/prompts.ts`
- `src/lib/export/html.ts`
- `src/lib/export/pdf.ts`
- `src/lib/export/docx.ts`
- `src/lib/export/epub.ts`

Data/model changes:
- add `authorName?: string` to `Book`
- migrate away from relying on `AppSettings.authorName`
- likely extend `Reference` usage with stronger marker binding via `refId`

UI behavior changes:
- editor shows chapter reference footer
- library shows Read action
- book routes use compact nav
- chapter list becomes number-first / condensed
- reader gets proper loading, fallback, and pagination resilience

## Out of scope
- scholarly source lookup APIs or DOI resolution
- server-side print pagination engine
- audiobook-style reading mode