# Testing VaseMaker

The tests check that every tool still builds closed, printable solids,
that saved designs still load, and that the pages work in a real browser.

## One-time setup

    npm install
    npx playwright install chromium

The page tests use **Playwright**, a free tool from Microsoft that drives
a real web browser from a script: it opens the app, clicks buttons, moves
sliders and loads design files the way a person would, and reports any
error. It is installed by `npm install`, but it uses its own copy of
Chromium (the open-source browser Chrome is built from), downloaded once
by the second command, about 150 MB. Your own browser is never used.

## Running them

    npm test              # about a minute: the quick suite
    npm run test:deep     # a few minutes: everything

**`npm test`** builds each mold, handle, sprig and bottom mark from known
designs and checks it is a closed solid, compares the shapes against
recorded results, loads every test design, and opens each page in the
browser. Run it after any change.

**`npm run test:deep`** adds sweeps across many settings and shapes, loads
every test design on every page in the browser, tries undo, redo, Revert
to Saved and Reset on each page, and takes random walks of 40 clicks
across the tools. Run it before a large change goes in.

Run only the checks whose name contains a word:

    npm test -- sprig

A random walk that fails prints its number; replay just that one with:

    CLICK_SEEDS=7 npm run test:browser -- click-paths

## Good to know

- The tests build and serve their own copy of the app in a temporary
  folder, so a running `npm run dev` is not needed or touched.
- Some checks use the author's own designs, which are not public. Without
  them those checks say **SKIPPED** — that is expected; everything else
  runs on the public designs in `tests/fixtures/`.
- Tested on macOS, where the browser tests use the Mac's graphics chip.
  On Windows or Linux they draw in software, which is slower; the deep
  suite may run long.
