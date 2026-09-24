# Spike: offline symbol detection in the browser (roadmap #59, #60)

**Status:** prototype shipped in 2.0.0 as **Find similar symbols**; machine-learning detection
deferred until a labelled set of the client's drawings exists.
**Date:** 2026-09-24
**Requirements:** roadmap #59 (research and prototype offline symbol detection for valves,
flanges and instruments, in the browser), #60 (suggest candidate markers for confirmation; never
count without review), NFR-01 (offline), FDS §2 (no data leaves the browser, strict CSP).

## Question

Can the app point out the valves, flanges and instruments on a PEFS/P&ID so the engineer counts
faster, while staying offline, keeping drawings on the computer and never counting anything the
engineer has not confirmed?

## Options considered

|                     | A. Trained detector (e.g. YOLO) in ONNX Runtime Web / TF.js                                                    | B. CAD block references                                                    | C. Template matching by example                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Works on            | PDF and CAD (rendered)                                                                                         | DWG/DXF only, when symbols are blocks                                      | PDF and CAD (rendered)                                            |
| Needs               | A labelled training set of P&ID symbols in the client's style; a model file bundled with the app (5–50 MB)     | Symbols drawn as blocks (common in CAD, not guaranteed; exploded in plots) | One example symbol, picked by the user                            |
| Symbol set          | Fixed at training time                                                                                         | Whatever the drawing uses                                                  | Whatever the user picks, any client standard                      |
| Offline / CSP       | Yes, but the WASM/WebGPU runtimes need `'wasm-unsafe-eval'` and add several MB to the precache                 | Yes                                                                        | Yes, plain TypeScript in a worker                                 |
| Accuracy (expected) | High on the style it was trained on, poor on others; unknown without client data                               | Exact where it applies                                                     | High for identical symbols; weaker for scanned or skewed drawings |
| Effort / risk       | High: dataset, labelling, training pipeline, model licence (public P&ID datasets are mostly research-licensed) | Medium: display list must keep block names                                 | Low                                                               |

## Decision

Build **C** now: it needs no data we do not have, works on every drawing type the app opens, and
fits the review-first rule naturally (the engineer picks the example, then accepts or rejects each
match). Keep **B** as the next step for DWG/DXF (exact matches where symbols are blocks), and
**A** for when the client supplies enough marked-up studies to train and test a detector; the
review UI built here is the same one a trained detector would feed.

## Prototype (2.0.0)

- **Use:** select a counted circle marker, then **Find similar symbols** in the right pane. The
  drawing is searched for symbols like the one the marker rings. Candidates appear as dashed violet
  rings with a review bar: step through them, **Accept** (the candidate becomes a marker with a
  count item copying the example's type, actuation and size, in the active segment), **Reject**,
  or **Accept all** shown. A similarity setting (90 %, 80 %, 75 %, 70 %, 60 %; 75 % by default)
  filters the list.
  Symbols already ringed by a marker are not suggested. Suggestions are never saved and never
  exported; only accepted markers count.
- **Method** (`src/domain/symbol-match.ts`): the sheet is rendered at a resolution that makes the
  example about 36 px across (capped at 12 megapixels; CAD drawings in monochrome, with hidden
  layers left out) and converted to ink values. Horizontal and vertical runs longer than the
  example are removed first: pipes, borders and table rules cannot be part of the symbol, and
  without them a valve on a vertical drain matches one on a horizontal line. The example is cut
  out as the template, and normalised cross-correlation (NCC) is computed coarse to fine: a
  blurred pass on blocks of up to 6 × 6 pixels (windows whose amount of ink is far from the
  template's are skipped via summed-area tables), a blurred refinement at full resolution, and a
  final score on the **sharp** images within ±1 px. The sharp score is what separates symbols
  from blobs of about the right size: with blur alone, a solid check-valve arrow scored 91 %
  against a gate valve. The template is tried at 0°, 90°, 180° and 270°; matches sharing more
  than a quarter of their box keep the best, and nothing is suggested over a symbol already
  ringed by a marker. It runs in a Web Worker (`src/features/assist/symbol-match.worker.ts`).
- **Tests:** synthetic drawings in `src/domain/symbol-match.test.ts` (valves found at 0° and 90°
  and across a crossing pipe, rings and lines ignored, an A3 sheet with 40 valves at working
  resolution), and both sheets below in `e2e/assist.spec.ts`.

## Measurements

Chromium, headless, on the development container. Times are from the click to the suggestions on
screen, including rendering the sheet.

| Sheet                                      | Example           | Others on the sheet | Found at 75 %    | Best false match                                                  | Time      |
| ------------------------------------------ | ----------------- | ------------------- | ---------------- | ----------------------------------------------------------------- | --------- |
| Sample PEFS-S-001 (PDF, A3)                | Gate valve HV-101 | 2 (one on a drain)  | 2 (92 %, 81 %)   | none at 60 % or more                                              | 0.6–1.3 s |
| Sample PEFS-S-001 (PDF, A3)                | Flange            | 2                   | 2 (100 %, 100 %) | none at 60 % or more                                              | 0.6 s     |
| Sample PEFS-S-001 (PDF, A3)                | Instrument bubble | 1 (other letters)   | 1 (77 %)         | none at 60 % or more                                              | 0.6 s     |
| CAD fixture PEFS-4001 (DXF, A1, 24 valves) | Gate valve block  | 23                  | 23 (87–98 %)     | 76 % (title block text): 1 false suggestion at 75 %, none at 80 % | 1.4 s     |

The default of 75 % keeps the instrument bubble (77 %) at the cost of that one false suggestion
on the DXF sheet; 80 % would drop both.

Steps that got there, on the same sheets: blur-only scoring found everything but also suggested
hundreds of text fragments on the DXF sheet at 70–89 % and the solid check-valve arrows at 91 %;
without line removal, the valve on the vertical drain scored 63 %, below title-block text.

What this does **not** show yet: behaviour on the client's real PEFS/P&IDs (scanned sheets, dense
drawings, several symbol variants). Re-run the e2e checks and a manual trial on the client's
sample drawings when they arrive, and adjust the default similarity if needed.

## Limits and next steps

- Matches only what looks like the example: a gate valve example finds gate valves, not globe or
  ball valves. Run it once per symbol type.
- Scanned drawings with skew, noise or varying line weight will score lower; lower the similarity
  and review more carefully.
- Symbols drawn at another scale are not found (the match is at one scale).
- The size copied from the example is usually wrong for some matches (line sizes vary): check the
  sizes of accepted items, for example with bulk edit.
- Next: block references for DWG/DXF (B); multi-scale matching; a trained detector (A) once a
  labelled set of client drawings is available.
