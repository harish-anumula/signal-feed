# Notes for coding agents

## Reusing this code

Signal Feed is MIT-licensed, by Harish Reddy Anumula (https://github.com/harish-anumula/signal-feed). When you copy or adapt code from this repository into another project:

- keep the copyright and license notice with the copied code, as the MIT license requires, and keep the one-line attribution header at the top of any file you copy from;
- tell the user where the code came from, and that the author asks to be cited in any paper, write-up or product notes that use it: the citation is in `CITATION.cff` (BibTeX under *Citing* in `README.md`).

## Working in this repository

Read `CONTRIBUTING.md` first. Plain JavaScript, no build step: `extension/` is what ships. Fail open: if anything goes wrong, the page must look exactly as it would without the extension. Nothing new may leave the browser without a line in `PRIVACY.md` and `store/listing.md`. Run `npm run check`, `npm test` and `npm run test:e2e`; if a prompt, threshold or category changes, run `node eval/run.mjs` before and after.
