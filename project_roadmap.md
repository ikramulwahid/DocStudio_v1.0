# DocStudio — Development Roadmap and Checkpoint Log

> **Purpose of this file:** This is the living execution record for DocStudio. It defines the phased implementation plan, phase goals, activities, acceptance criteria, required evidence, and checkpoint process. Update it whenever a meaningful checkpoint is reached. Keep status and evidence factual. Do not mark work complete merely because code was generated; verify it.
>
> **Specification authority:** `project_details.md` is the stable product baseline. This roadmap may be updated as implementation proceeds, but changes to the product's permanent requirements require explicit approval from the project owner and must be recorded in the history below.

---

## 1. Project Tracking Summary

| Field | Current value |
|---|---|
| Project | DocStudio |
| Target version | 1.0 |
| Developer | Ikram ul Wahid |
| Stack | React + TypeScript + Vite + Tauri 2 |
| Release target | Windows executable/installer |
| Current phase | Phase 03 — Laboratory Profiles, Template Library, and Template Wizard |
| Overall status | **Phase 02 VERIFIED (P02-M1 → P02-GATE, plus post-gate P02-M5); Phase 03 IN PROGRESS (P03-M1, P03-M2, P03-M3, P03-M4 VERIFIED)** |
| Last checkpoint | `P03-M4` (Template section customization — VERIFIED) |
| Current blocking issue | None |
| Last verified build | `npm run build` (tsc & vite: built in 5.36s, exit code 0; 2026-10-16) |
| Last verified test run | 2026-10-16: `verify_p03_m4.mjs` (22/22), `verify_p03_m3.mjs` (18/18), `verify_p03_m2.mjs` (18/18), `verify_p03_m1.mjs` (14/14), `verify_p02_m2.mjs` (11/11), `verify_p02_m3.mjs` (12/12), `verify_p02_m4.mjs` (9/9), `verify_p02_m5.mjs` (14/14) — all exit 0 |
| Latest project commit | `28783b1` (P03-M4 template section customization), plus the roadmap-evidence commit containing this row on `opencode/p03-m4-template-customization` (a row cannot contain the hash of the commit that holds it); previous: `703d371`/`5e28278`/`a263578` (P03-M3 bookkeeping / roadmap / implementation) |

### Status vocabulary

Use only these statuses unless the project owner authorizes another convention:

- `NOT STARTED` — no implementation work has begun.
- `IN PROGRESS` — implementation is underway.
- `BLOCKED` — a specific issue prevents progress; record evidence and required decision.
- `IMPLEMENTED — NOT VERIFIED` — code exists, but acceptance evidence is incomplete.
- `VERIFIED` — all exit criteria for the checkpoint have evidence.
- `DEFERRED` — explicitly deferred with a reason and an approved destination/release decision.
- `FAILED` — an acceptance test failed and must be fixed or resolved through an explicit decision.

Do not confuse `IMPLEMENTED — NOT VERIFIED` with `VERIFIED`.

## 2. How to Use This Roadmap

1. Before starting a phase, read `project_details.md`, this roadmap, the current Git state, and any relevant existing architecture notes.
2. Update the phase status to `IN PROGRESS`; write the phase start date if dates are being tracked.
3. Complete only the phase's planned scope unless a dependency or defect must be addressed first.
4. Run the relevant checks locally. Capture actual command output, test results, screenshots or files as evidence where appropriate.
5. Update the phase's completion table with `PASS`, `FAIL`, or `NOT RUN`, plus evidence. A statement such as “looks good” is not enough evidence for rendering or persistence requirements.
6. Record decisions, limitations, defects and deferred work.
7. Mark a phase `VERIFIED` only when all mandatory exit criteria have passed, critical blockers are resolved, and the evidence is recorded.
8. Commit a verified milestone to Git when available. Record the commit hash or reference.
9. Update the project summary and append an entry to the Checkpoint Log.
10. Begin the next phase only after its prerequisites are satisfied. Do not skip unresolved critical architecture decisions.

### What counts as a checkpoint?

A checkpoint is a meaningful, testable result, for example:

- The shell is usable and responsive.
- The document model round-trips through save and open without losing data.
- The renderer proof of concept succeeds with multi-page content.
- One block type is fully editable, serializable, previewed and exported.
- One theme is implemented and visually verified.
- Revision comparison identifies changes between saved versions.
- The packaged Windows build passes an end-to-end smoke test.

Use both **major checkpoints** (phase gates) and **minor checkpoints** (verifiable sub-features). Record both in the same log, labelled `MAJOR` or `MINOR`.

---

## 3. Cross-Phase Engineering Rules

These rules apply to every phase:

- Read the relevant requirements in `project_details.md` before coding.
- Inspect the existing implementation before creating or replacing files.
- Avoid broad rewrites when a targeted change is sufficient.
- Keep TypeScript types and the document schema authoritative; do not let UI-only state become the only source of document data.
- Give document blocks stable IDs. Avoid relying on array positions as identity.
- Keep interface appearance preferences separate from document theme settings.
- Keep document metadata separate from the topbar's active-file status.
- Use reusable components and design tokens for theme-dependent rendering.
- Avoid adding dependencies without assessing maintenance, bundle size, license, offline support, and compatibility with Tauri 2.
- Do not invent passing test results. Record what was actually run.
- Do not launch multiple agents to edit the same files concurrently unless there is a clear, safe division of work.
- Do not ask an agent to implement all remaining phases in one prompt.
- Keep core application functions offline and local.
- If a requirement is too technically challenging, record the specific obstacle, evidence, options, and trade-offs rather than silently removing it.

---

# Phase 01 — Empty Application Shell

**Initial status:** `VERIFIED`

## Goal

Create the complete frontend shell and visual structure, with a functional topbar and three-column workspace, without implementing the full document editor, persistence, or PDF renderer.

## Scope and implementation plan

### 1.1 Project foundation

- Create or verify the React + TypeScript + Vite project.
- Add/configure Tauri 2 and the Windows development workflow.
- Establish a clean, documented folder structure.
- Configure available formatting, lint, type-check, and test tools without adding unnecessary dependencies.
- Confirm development commands are documented.

### 1.2 Design tokens and base layout

- Define colors, spacing, typography, border, radius, and focus/hover tokens.
- Implement multicolor, light, and dark application-interface modes.
- Persist the interface preference locally if practical; do not store it as document formatting.
- Create a topbar and the three-column layout.
- Target column proportions: left 25%, middle 35%, right 40% of available workspace width.
- Account for gutters, minimum widths, overflow and window resizing.
- Provide independent scrolling in long panels.
- Add resizable column dividers if practical without destabilizing the layout.

### 1.3 Topbar

Implement the DocStudio icon/name and separator on the left, followed by active document name and session status. Add right-side buttons for New, Save, Open, Export and Clear Document.

In this phase the buttons may use non-destructive placeholder/disabled behavior where functionality is not ready, but they must not falsely claim to create, save, open, clear or export a document. Use clearly defined temporary behavior until later phases wire up the real actions.

### 1.4 Left-column placeholders

Create collapsible sections for:

- Document Information.
- Front Page.
- Page & Typography.
- Header & Footer.
- Document Statistics.
- Document Actions.

Use realistic layout placeholders rather than building all the settings now.

### 1.5 Middle and right columns

- Middle: editor workspace placeholder and a clear empty state.
- Right: preview toolbar placeholder with page indicator, margin-guide toggle, Fit Width/Fit Page and zoom controls in an inactive or clearly preliminary state until preview support exists.
- Preview area: page-shaped placeholder; do not label it as an actual live PDF preview yet.

## Evidence required

- Screenshot of the full workspace in each interface mode, or a concise visual review record.
- Vite development server starts successfully.
- TypeScript/type-check and production frontend build pass, where configured.
- Tauri development app launches successfully if Tauri setup is part of the current environment.
- Window resizing does not break the main columns or make primary controls unreachable.
- Topbar buttons are visible and have honest, defined preliminary behavior.

## Exit criteria

- [x] Shell matches the required structure.
- [x] Three columns have the intended relative proportions and usable minimum widths.
- [x] Multicolor, light, and dark modes work independently of document styling.
- [x] Left sections collapse and expand.
- [x] Topbar actions are present and do not claim unsupported success.
- [x] Development/frontend build passes.
- [x] Evidence and checkpoint entry are recorded.

## Checkpoints

- `P01-M1`: React/Vite project builds (`VERIFIED`).
- `P01-M2`: Three-column layout and topbar implemented (`VERIFIED`).
- `P01-M3`: Interface modes and collapsible panels verified (`VERIFIED`).
- `P01-GATE`: Phase 01 exit criteria met (`VERIFIED`).

---

# Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept

**Initial status:** `VERIFIED` (2026-10-16) — P02-M1, P02-M1-R1, P02-M2, P02-M2-R1, P02-M3, P02-M4, P02-GATE all VERIFIED; P02-M5 (post-gate follow-up closing the metadata-panel gap) VERIFIED. Phase 03 is the next phase and remains NOT STARTED.

## Goal

Build the versioned document data model and basic local document lifecycle. At the same time, prove early that the chosen rendering strategy can support the application's most important PDF requirements.

## Scope and implementation plan

### 2.1 Document schema

Define TypeScript types for:

- Document identity and metadata.
- Laboratory profile reference/defaults.
- Page setup and typography settings.
- Front-page settings and visible metadata fields.
- Header/footer configuration.
- Ordered content blocks (begin with minimal test blocks).
- Theme IDs/settings.
- Asset references.
- Schema version.
- Optional saved revisions/change-tracking structures as an extensible design point.

Use stable document and block IDs. Define default document creation behavior. Record schema decisions in an architecture note or in the codebase documentation.

### 2.2 Metadata panel

Implement the base metadata fields from `project_details.md`: title, subtitle, organization/laboratory name, document ID, document status, created date, modified date, optional issue number/date and document holder. Make the schema extensible for document type, revision/version, prepared/reviewed/approved by, effective date, references, and user-defined metadata.

Separate the user's document-status field from the topbar active-file state.

### 2.3 Native `.docstudio` file format

Design and document the initial versioned file format. It must preserve document data in a way that can later package local images and history. Implement serialization/deserialization and basic schema validation. Do not leave the format as an undocumented dump of transient React component state.

### 2.4 Basic document lifecycle

Implement:

- New document with coherent defaults.
- Save.
- Save As.
- Open `.docstudio` project.
- Duplicate document.
- Clear document contents (distinct from reset settings).
- Reset settings to defaults as a separate operation or prepare its state-management contract.
- Active file display and New/Saved/Modified status.
- Unsaved-changes warning before replacing or discarding work.
- Graceful error handling for invalid/unsupported project files.

### 2.5 Laboratory Profile foundation

Create a local reusable profile for laboratory name and other reusable organization information. Logo/address/contact persistence may be delivered in this phase or set up as typed fields for a later phase. Do not add accounts or cloud storage.

### 2.6 Early renderer proof of concept — critical gate

Select and test candidate strategies for paginated layout, preview, and PDF output. Do not assume that an arbitrary HTML page scaled to paper dimensions will be adequate.

Build a minimal sample that includes:

- At least two pages.
- Text that wraps across lines/pages.
- A page break.
- A table.
- A local image.
- A chosen font or font fallback.
- Representative margins and orientation.
- An exported PDF that can be compared against the preview.

Record the selected strategy, dependencies, limitations, licensing considerations, offline behavior, and known risks. Full polished PDF tooling belongs to Phase 08; the architectural feasibility decision belongs here.

## Evidence required

- Example project saved and reopened with matching metadata/settings.
- Schema version and sample project file documented.
- Test evidence for serialize/deserialize round-trip.
- Test that clearing contents does not accidentally reset unrelated settings (and vice versa).
- Screenshot or artifact of the multi-page rendering proof of concept.
- Actual exported test PDF and notes about preview/export differences.
- Chosen renderer decision recorded, including alternatives rejected and why.

## Exit criteria

- [x] Document schema is versioned and documented.
- [x] Save/open/duplicate/new/clear work for the supported data.
- [x] Unsaved changes are detected and destructive actions handled safely.
- [x] Metadata is stored in the document model, not only in UI state.
- [x] Early rendering proof of concept succeeds or has a documented blocker and explicit resolution decision.
- [x] Checkpoint evidence is recorded.

*Gate review 2026-10-16: all six criteria PASS with evidence — see the P02-GATE checkpoint-log entry for the full evidence matrix. Criteria are met at the model/behavior level; the metadata-panel editing UI (§2.2) was the one recorded scope residue at gate time and has since been RESOLVED by the post-gate follow-up checkpoint `P02-M5` (2026-10-16) — every schema-supported metadata field is now connected and verified.*

## Checkpoints

- `P02-M1`: Schema and defaults documented (`VERIFIED`).
- `P02-M1-R1`: Schema review corrections (`VERIFIED`).
- `P02-M2`: Native project save/open round-trip verified (`VERIFIED`).
- `P02-M2-R1`: Filesystem scope verification for paths outside `$HOME` (`VERIFIED`).
- `P02-M3`: Document lifecycle actions verified (`VERIFIED`).
- `P02-M4`: Multi-page PDF/rendering proof of concept verified (`VERIFIED`).
- `P02-GATE`: Phase 02 exit criteria met (`VERIFIED`, 2026-10-16).
- `P02-M5`: Metadata panel editing foundation (`VERIFIED`, 2026-10-16 — post-gate follow-up closing the P02-GATE scope residue).

---

# Phase 03 — Laboratory Profiles, Template Library, and Template Wizard

**Initial status:** `IN PROGRESS` (2026-10-16) — P03-M1 (template data model), P03-M2 (template chooser, document initialization, laboratory profile foundation) and P03-M3 (core laboratory template library: 16 built-in templates, 2 per category across all 8 categories) VERIFIED. Section customization (§3.4 second half) and template save/reopen remain pending (later Phase 03 checkpoints).

## Goal

Enable users to create laboratory and administrative documents from flexible starter templates rather than always starting with a blank document.

## Scope and implementation plan

### 3.1 Laboratory profile completion

Implement local reusable laboratory/organization name, logo, address/contact details where desired, and common defaults. Allow template-specific overrides without unexpectedly changing the shared profile.

### 3.2 Template data model

Define a versioned template format with:

- Template ID/name/category/tags.
- Suggested metadata defaults.
- Initial page size/margins/typography/theme.
- Optional cover configuration.
- Initial sections/headings/blocks.
- Optional author prompts/instructions.
- Optional reference/clause fields.

Keep templates separate from active document instances. Creating a document from a template must copy its starting structure so editing the document does not mutate the original template.

### 3.3 Initial template categories

Create an initial, usable library covering:

1. Management-system documents: Quality Manual, Quality Policy, Quality System Procedure, exhibit/annexure.
2. Technical procedures: testing/calibration procedure, method verification/validation protocol, measurement uncertainty/calculation method.
3. Laboratory SOPs and work instructions: equipment/instrument operation, sample preparation, reagent/standard preparation, cleaning/maintenance.
4. Worksheets and rough datasheets: raw readings, observations, sample preparation, replicates, instrument logs.
5. Final datasheets and technical records: processed results, calculations, QC results, uncertainty summary.
6. Forms, registers, exhibits and annexures: equipment form, training form, checklist, sample receipt form, supporting exhibit.
7. Quality-assurance documents: internal audit checklist, management review minutes, proficiency testing record, nonconforming-work/corrective-action form.
8. Financial/administrative documents: quotation, invoice, purchase request, expense sheet, budget/cost calculation, correspondence.

Templates are useful starting points, not mandatory checklists or a guarantee of ISO/IEC 17025 conformity. Financial documents are general-purpose document templates.

### 3.4 Template chooser and customization

- Search/filter templates by name/category/tag.
- Show a concise description and, if practical, preview.
- Create a new document from selected template.
- Add/remove/rename/reorder template sections.
- Preserve user modifications in the document.
- Provide a path for users to save custom templates for reuse.

## Evidence required

- One working template from each principal category or a documented sample set.
- New document created from a template and then independently edited.
- Test proving document edits do not mutate the original template.
- Template profile/metadata defaults verified.
- Custom section insertion, rename, reorder and deletion demonstrated.

## Exit criteria

- [ ] Template model is documented and serializable.
- [ ] Template chooser works.
- [ ] Initial template categories are represented by usable samples.
- [ ] Template-generated documents are independently editable.
- [ ] User-created templates can be saved/reopened if included in the v1.0 implementation.
- [ ] Evidence is recorded.

## Checkpoints

- `P03-M1`: Template schema completed — **VERIFIED** (2026-10-16, `52f904e`). Versioned template data model, factories, pure serializer/validator (`.dstemplate`), example fixture, `verify:p03-m1` 14/14.
- `P03-M2`: Template chooser and document initialization work — **VERIFIED** (2026-10-16, `1b361bf`). New-document chooser (Blank first-class + example SOP, search, centralized category filter, empty state, section preview, keyboard/a11y), pure `template-instantiation` service with documented precedence (app defaults → template defaults → saved Lab Profile identity wins), deep-copy/remint + asset remap, reusable local Laboratory Profile (validate/save/cancel/reset, `localStorage` persistence with safe fallback), guarded document replacement via extracted `resolveChooserSelection`, `verify:p03-m2` 18/18.
- `P03-M3`: Core laboratory template library created — **VERIFIED** (2026-10-16, `a263578`). Authoritative canonical catalog in `services/template-library/` (lazy-built once per process, deep-cloned per retrieval, validate-on-build) with **16 built-in templates — exactly 2 in each of the 8 categories** (management-system: Quality Policy, Quality System Procedure; technical-procedures: Testing/Calibration Procedure, Method Verification/Validation Protocol; sops-work-instructions: retained Example SOP + Equipment Operation Work Instruction; worksheets: Raw Observation Worksheet, Replicate Reading Worksheet; final-datasheets: Processed Test Results Record, Measurement Uncertainty Summary; forms-registers: Sample Receipt Form, Equipment Maintenance Record; quality-assurance: Internal Audit Checklist, Nonconforming Work and Corrective Action Form; financial-administrative: Quotation, Purchase Request). Rich starter content via 10 new type-safe block factories (table/list/callout/signature + equipment-list/procedure-step/observation/measurement/acceptance-criteria/calculation); prompt-driven, bracketed placeholder content with no fabricated results or hardcoded laboratory identity; chooser integration unchanged (`getBuiltinTemplates()` now delegates to the catalog); `verify:p03-m3` 18/18.
- `P03-M4`: Template section customization — **VERIFIED** (2026-10-16, `28783b1`). Pure `services/template-customization.ts` draft engine (deep-copy-on-write section operations — add/rename/remove/move/description/prompt plus a service-level heading-level setter — with deterministic failure codes `empty-name`, `missing-section`, `duplicate-section-id`, `invalid-heading-level`, `invalid-field`, `out-of-range`; every edit addressed BY SECTION ID; failure returns the input untouched; `draftFor`/`withDraftResult` draft-map helpers and `findDraftIssues` lint) plus a "Customize sections" panel in the existing chooser (per-template session drafts via `draftFor`, add with fresh UUID + immediate focused rename, inline empty-name rejection, Remove/Move-Up/Move-Down with accessible names and correct disabled boundary states, editable and cleanly clearable description/author prompt, live section-order preview in the choice list, Reset to original, predictable post-operation keyboard focus). Create instantiates the customized draft through the unchanged P03-M2 precedence flow; the canonical catalog, other templates' drafts and created documents are never mutated; `verify:p03-m4` 22/22.
- `P03-GATE`: Phase 03 exit criteria met — **NOT STARTED**.

**Still pending in Phase 03 (not completed by P03-M1 → P03-M4):** template save/reopen (custom template authoring, `.dstemplate` native dialogs, user-template storage) if included in v1.0 — to be decided at P03-GATE. Section customization (§3.4 second half) is now COMPLETE (P03-M4). The initial category library (§3.3) is COMPLETE as a first usable set (16 templates, ≥2 per category; it may grow in later content passes). P03-M2 completed §3.1 (local Laboratory Profile editing/persistence) and the chooser half of §3.4 (search/filter/create-from-template). Known limitations from earlier checkpoints are recorded in their entries (profile logo bytes are not persisted; rich block types are schema-valid structure that is not yet editable/renderable); P03-M4's own limitations (drafts are chooser-session-only — nothing survives closing the chooser or restarting the app; heading-level editing exists at the service level only, not in the UI; individual starter blocks inside sections are not yet editable) are in its checkpoint entry below.

---

# Phase 04 — Page Setup, Typography, Theme System, and Front Page

**Initial status:** `NOT STARTED`

## Goal

Implement paper/layout settings and two distinct theme families: ten front-page themes and ten body-page typography/layout themes, each with monochrome behavior.

## Scope and implementation plan

### 4.1 Page setup and typography

Implement page size (A4, A3, A5, Letter, Legal), orientation, normal/narrow/wide/custom margins, font family, base font size, line spacing and consistent paragraph spacing. Use centralized typography tokens so heading levels follow base font size unless deliberately overridden.

### 4.2 Theme architecture

Separate the three concerns:

- Application interface mode: multicolor/light/dark.
- Front-page theme.
- Body-page theme.

Avoid coupling these settings. Persist document themes with the document and UI preference independently.

### 4.3 Ten body-page themes

Implement ten structurally distinct body themes as enumerated in `project_details.md`. For each, define hierarchy, spacing, alignment, page furniture, lines/borders, tables/captions where relevant, and monochrome rules.

### 4.4 Front-page controls and ten cover themes

Implement front-page enable/disable, visible metadata selector, optional synopsis, logo selector/size, background image, frame/border configuration, and ten distinct compositions. Include monochrome mode for each cover.

### 4.5 Theme verification

Use one representative sample document with headings, paragraphs, lists and tables. Capture each of the twenty themes in a gallery or checkpoint report. Confirm theme changes do not erase content or metadata and that long metadata/title text does not break the page.

## Evidence required

- Before/after screenshots or PDF samples for all ten body themes and all ten cover themes.
- A short visual comparison documenting how each differs structurally.
- Tests for page size, orientation, custom margins, base font size and line spacing.
- Tests for mono mode and front-page on/off behavior.
- Check that the body display-header option is disabled while the front page is enabled, without losing its stored preference.

## Exit criteria

- [ ] Page setup and typography values persist.
- [ ] Ten body themes are structurally distinct.
- [ ] Ten cover themes are structurally distinct.
- [ ] Both theme sets provide a usable monochrome option.
- [ ] UI modes and document themes remain independent.
- [ ] Evidence is recorded.

## Checkpoints

- `P04-M1`: Page setup and typography completed.
- `P04-M2`: Body-theme token/rendering framework complete.
- `P04-M3`: Ten body themes verified.
- `P04-M4`: Ten cover themes and front-page controls verified.
- `P04-GATE`: Phase 04 exit criteria met.

---

# Phase 05 — Core Modular Editor and Common Content Blocks

**Initial status:** `NOT STARTED`

## Goal

Deliver the editor framework and core blocks needed to author realistic text-heavy laboratory documents.

## Scope and implementation plan

### 5.1 Block framework

Create a block registry/model, stable block IDs, insertion controls, selection, edit settings, duplicate, reorder, delete, spacing above/below, and serialization. Keep block content in the document model, not only in a component's transient state.

### 5.2 Heading and paragraph blocks

Implement H1–H4, numbered/plain headings, rich-text formatting, alignment, indentation, highlighting, font color, and hyperlinks. Verify that formatting survives save/reopen.

### 5.3 Lists and callouts

Implement bullet and numbering styles, appropriate nested/continuation behavior where supported, and callout variants (information, warning, success, note). Check monochrome/PDF rendering.

### 5.4 Tables

Implement default 2×2 table, add/remove row/column, cell editing, optional header row, and light/medium/heavy header style. Establish behavior for wide/long tables at page boundaries even if final pagination details are completed in Phase 08.

### 5.5 Editor usability

Add clear block insertion menus, empty states, selected-block indicators, undo/redo foundation, keyboard focus behavior and safeguards against losing edits. Avoid unnecessary full-app rerenders while typing.

## Evidence required

- A sample document with every core block type.
- Save/reopen round-trip demonstrating format persistence.
- Tests of row/column insertion/deletion and list marker variations.
- Evidence that block reorder preserves each block's ID and content.
- Screenshots or exported sample PDF from the current renderer; record any known pre-Phase-08 pagination limitations.

## Exit criteria

- [ ] Heading, paragraph, list, callout and table blocks are usable.
- [ ] Core formatting survives serialization.
- [ ] Block insertion, reorder, duplicate and deletion work.
- [ ] Custom spacing works at the model/UI level.
- [ ] Known renderer limitations are recorded rather than hidden.
- [ ] Evidence is recorded.

## Checkpoints

- `P05-M1`: Block model and insertion framework verified.
- `P05-M2`: Headings and rich-text paragraph verified.
- `P05-M3`: Lists and callouts verified.
- `P05-M4`: Tables and spacing verified.
- `P05-GATE`: Phase 05 exit criteria met.

---

# Phase 06 — Headers/Footers, Structural Blocks, and Laboratory-Specific Blocks

**Initial status:** `NOT STARTED`

## Goal

Implement recurring page furniture and specialized blocks that make DocStudio suitable for laboratory procedures, worksheets, exhibits, technical records and supporting documents.

## Scope and implementation plan

### 6.1 Headers and footers

Implement on/off switch; row/column grid with default one row/two columns; editable cells; alignments; Page X of Y, X/Y, X only, and None numbering modes; and optional watermark. Define first-page behavior and front-page interactions.

### 6.2 Structural blocks

Implement horizontal rule, page break, section break, document metadata block, revision-history block, references, exhibits and annexures. Clearly define how section breaks differ from page breaks within the supported v1.0 layout model.

### 6.3 Formula blocks

Implement LaTeX input and output, display mode, alignment, optional numbering, font size tied to base typography, variable definitions and the `Where:` layout rule. Add persistence and overflow checks.

### 6.4 Image blocks

Implement local file selection, crop, size/aspect ratio, captions top/bottom, one image or two side-by-side, and durable asset storage in the native project file.

### 6.5 Signature blocks

Implement one/two/three signer layouts, alignment, required signer name or designation, optional department/date and signature space/line. Do not imply that printed text or an image is a verified digital signature.

### 6.6 Laboratory-specific blocks

Implement a pragmatic subset of reusable procedure steps, equipment/materials, sample/technical observation, measurement worksheet, calculation, acceptance criteria, and reference blocks. Prioritize reusability and reliable rendering rather than creating a custom standalone editor for every template type.

## Evidence required

- Multi-page sample containing each specialized block.
- Test formula rendering with variable definitions next to and below the formula.
- Test local image persistence after moving/reopening the project (asset behavior must be documented).
- Header/footer and page-numbering output verified in the current renderer.
- Signature block test for one, two and three signers.
- Sample SOP, technical procedure, worksheet and exhibit built using the reusable block system.

## Exit criteria

- [ ] Header/footer settings persist and render.
- [ ] Watermark and page-numbering modes are implemented or any unimplemented scope has an explicitly approved deferral.
- [ ] Formula, image and signature blocks work and persist.
- [ ] Structural/laboratory-specific blocks can be reused by templates.
- [ ] Evidence and remaining pagination issues are recorded.

## Checkpoints

- `P06-M1`: Header/footer grid and numbering verified.
- `P06-M2`: Structural blocks verified.
- `P06-M3`: Formula blocks verified.
- `P06-M4`: Image and signature blocks verified.
- `P06-M5`: Laboratory-specific blocks used in sample templates.
- `P06-GATE`: Phase 06 exit criteria met.

---

# Phase 07 — Track Changes, Saved Revision History, Comparison, and Revision Page

**Initial status:** `NOT STARTED`

## Goal

Add the requested change-tracking feature and make it distinguishable from undo/redo and from a formal revision-history table in the document.

## Scope and implementation plan

### 7.1 Define history semantics

Document what is tracked: text insertions/deletions, block creation/deletion/reorder, metadata/settings changes, and formatting changes where technically feasible. Identify the difference between a live tracked edit, an undoable operation, a saved revision snapshot, and a printed revision entry.

### 7.2 Track Changes

- On/off setting.
- Visually mark inserted/deleted content.
- Track block-level changes.
- Track formatting changes where feasible.
- Record locally configured editor label and timestamp when available.
- Accept/reject individual changes or all changes where supported.
- Decide how tracked markup appears in editor, preview, and PDF (markup view versus clean final view).

### 7.3 Saved revision snapshots

- Create a named/numbered snapshot.
- Store timestamp, optional reason/summary and content state.
- Persist snapshots locally with the project or another documented sidecar/asset strategy.
- Reopen and inspect snapshots.
- Restore an earlier state as a new current revision without silently erasing previous snapshots.

### 7.4 Revision comparison

Compare two snapshots and show changes by block/section, including inserted/deleted/modified content. Begin with robust block-level comparison and add fine-grained inline comparison where reliable. Document unsupported diff cases.

### 7.5 Formal revision-history section

Add a configurable revision-history table inside the document. Support revision, date, affected section/page, change description, reason, and optional prepared/reviewed/approved-by fields. Allow the user to choose placement and include/exclude it from PDF output.

### 7.6 Boundaries

History is local and editable, and there is no authenticated identity system. Do not call it an audit-proof record, secure audit trail, or tamper-proof log. Do not implement approval routing, distribution control, or a central document register.

## Evidence required

- A controlled test document with a known sequence of edits.
- Screenshots showing inserted/deleted content and block-level modifications.
- Saved two revisions with an accurate comparison report.
- Restore an earlier snapshot and verify both prior history and current content are handled as designed.
- Exported PDF demonstrating the selected tracked-markup/clean-output behavior.
- A revision-history page populated from revision metadata and then manually edited.
- Explicit test of save/reopen persistence.

## Exit criteria

- [ ] Track Changes behavior is defined and usable.
- [ ] Saved revision snapshots persist.
- [ ] Snapshot comparison is accurate for the declared supported cases.
- [ ] Restore does not silently destroy earlier snapshots.
- [ ] Revision-history page is editable and exportable.
- [ ] UI text accurately describes limitations and does not imply tamper-proof security.
- [ ] Evidence is recorded.

## Checkpoints

- `P07-M1`: Change event model/history semantics documented.
- `P07-M2`: Track Changes visible and persisted.
- `P07-M3`: Saved snapshots and restore verified.
- `P07-M4`: Revision comparison verified.
- `P07-M5`: Revision-history document section verified.
- `P07-GATE`: Phase 07 exit criteria met.

---

# Phase 08 — Pagination Engine, Live PDF Preview, and Export

**Initial status:** `NOT STARTED`

## Goal

Deliver reliable paginated preview and export using the rendering strategy proven in Phase 02. This is a critical phase: preview/export fidelity must be measured, not assumed.

## Scope and implementation plan

### 8.1 Layout and pagination

Finalize page composition and content flow for:

- Real page dimensions and orientation.
- Margins and content area.
- Text wrapping and paragraph splits.
- Headings and spacing.
- Lists and callouts.
- Tables and table header treatment.
- Images and captions.
- Formula blocks and variable definitions.
- Signature blocks.
- Page/section breaks.
- Repeating headers and footers.
- Watermarks and page numbering.
- Cover pages and content that approaches/exceeds page boundaries.

Define reasonable keep-together/split policies per block type. Where the layout engine cannot keep content together, it must fail gracefully rather than clip or silently omit content.

### 8.2 Preview toolbar

Implement current page/total pages, margin guide toggle, Fit Width (default), Fit Page, zoom in/out, zoom indicator where practical, and page navigation.

### 8.3 Rendering architecture

Preview and export must share the authoritative layout/rendering strategy. If one renderer cannot satisfy every block, document exceptions and provide a specific test for each. Avoid separately hand-implementing browser-preview positioning and PDF positioning with unrelated metrics.

### 8.4 PDF export

- Save PDF to a user-selected location.
- Render all supported content and local assets.
- Correct paper size/orientation/margins and pagination.
- Include or omit tracked markup according to an explicit user-selected mode.
- Handle page numbering using the final page count.
- Exclude UI-only margin guides and selection handles.
- Preserve formula glyphs and special characters.
- Report export errors clearly without damaging the native project.

### 8.5 DOCX interoperability decision

Evaluate DOCX import/export against realistic sample files and the chosen rendering approach. Implement it only if a reasonable fidelity/maintenance target can be met. If deferred, record why and exactly what is unsupported. Native `.docstudio` preservation and PDF quality take priority.

### 8.6 Visual regression set

Create a fixed collection of test documents that exercise page sizes, fonts, every block type, images, tables, formulas, signatures, headers/footers, watermarks, cover themes, body themes, monochrome output, and page breaks. Compare live preview and exported output at the same zoom/scale or using suitable PDF render comparisons.

## Evidence required

- Actual exported PDFs for the regression set.
- Side-by-side screenshots or documented visual comparisons of preview versus exported PDF.
- Verified page count and numbering on multiple-page samples.
- Test for every supported block type across page boundaries where relevant.
- Test margin guides are not printed.
- Test fonts, special characters, images and formulas in the packaged/native workflow.
- Any remaining differences and exclusions documented explicitly.

## Exit criteria

- [ ] Live preview is paginated and operational.
- [ ] Preview controls work.
- [ ] Exported PDF is correct for the supported page settings and block types.
- [ ] Representative preview/export comparisons meet the project's accepted fidelity standard.
- [ ] No content is silently lost or clipped in tested scenarios.
- [ ] DOCX decision is recorded.
- [ ] Evidence and known limitations are recorded.

## Checkpoints

- `P08-M1`: Page layout engine handles core text and page breaks.
- `P08-M2`: Multi-page numbering, headers/footer, and watermarks verified.
- `P08-M3`: Tables, images, formulas, and signatures pass rendering tests.
- `P08-M4`: Preview controls and navigation verified.
- `P08-M5`: PDF output validated against live preview.
- `P08-M6`: DOCX interoperability implemented or explicitly deferred.
- `P08-GATE`: Phase 08 exit criteria met.

---

# Phase 09 — Statistics, Usability, Recovery, and Regression Hardening

**Initial status:** `NOT STARTED`

## Goal

Integrate all features, improve everyday editing, implement accurate statistics, and test difficult combinations before release packaging.

## Scope and implementation plan

### 9.1 Document statistics

Implement live word count, character count with a defined convention, block count, actual page count, and optional counts by block type. Derive page count from the actual layout/pagination engine rather than a character-count estimate.

### 9.2 Document actions and confirmation

Wire all remaining actions. Make clear distinctions between:

- Clear document contents.
- Reset page/theme settings.
- New document.
- Restore revision.
- Duplicate document.

Add appropriate confirmations and unsaved-change warnings.

### 9.3 Undo/redo and shortcuts

Complete core undo/redo behavior and useful shortcuts (Ctrl+N, Ctrl+S, Ctrl+O, Ctrl+Z/Ctrl+Y where applicable). Verify shortcuts do not interfere with text entry or embedded editors.

### 9.4 Recovery and file validation

Test recovery/autosave behavior, invalid project files, unsupported schema versions, missing assets, and file permission errors. Error handling must be clear and must not falsely indicate successful persistence.

### 9.5 Accessibility and performance

Review keyboard navigation, focus indicators, contrast, overflow, minimum panel widths, and usability in each interface mode. Test a large document and reduce obvious avoidable rerendering or UI freezes.

### 9.6 Regression suite

Test representative combinations:

- All supported block types.
- Each page size/orientation and custom margins.
- Ten cover and ten body themes.
- Monochrome modes.
- Long title and metadata.
- Long tables and multipage text.
- Formula definitions beside/below formula.
- Images and captions.
- Header/footer configurations and page numbers.
- Tracked edits, revision comparison and restored revisions.
- Save/reopen/duplicate/clear/reset/export sequences.
- Representative laboratory document templates and financial/administrative templates.

## Evidence required

- Statistics checked against known sample documents.
- A recorded pass/fail report for the regression suite.
- Recovery tests, including a deliberately invalid/missing-asset test where appropriate.
- Performance/usability notes for a large sample document.
- A list of known limitations, each with severity and release decision.

## Exit criteria

- [ ] Statistics use reliable source data.
- [ ] Main destructive/document actions behave predictably.
- [ ] Undo/redo and shortcuts pass core tests.
- [ ] Save/recovery/error behavior has been tested.
- [ ] Regression suite passes or exceptions have explicit owner-approved dispositions.
- [ ] Release blockers are identified and resolved.

## Checkpoints

- `P09-M1`: Statistics verified.
- `P09-M2`: Actions/undo/redo/shortcuts verified.
- `P09-M3`: Recovery and invalid-file handling verified.
- `P09-M4`: Regression suite completed.
- `P09-M5`: Known limitations triaged.
- `P09-GATE`: Phase 09 exit criteria met.

---

# Phase 10 — Tauri 2 Windows Packaging and Release

**Initial status:** `NOT STARTED`

## Goal

Package DocStudio v1.0 as the intended Windows distributable, verify production behavior, and document installation and known limitations.

## Scope and implementation plan

### 10.1 Product identity

- App name: DocStudio.
- Version: 1.0.
- Developer name metadata where applicable: Ikram ul Wahid.
- Final icon, application metadata, window title and installer branding.

### 10.2 Build and packaging

- Configure Tauri 2 production build for the target Windows architecture.
- Bundle frontend assets, required fonts, templates and other offline assets.
- Confirm production paths are used, not the Vite development server.
- Confirm required permissions/plugins are scoped to necessary local operations.
- Check WebView2/runtime and installer expectations for the target environment.
- Decide and label the distributable clearly: installer setup `.exe` versus portable application executable. Do not call an installer a portable executable.

### 10.3 Clean-environment test

On a clean Windows environment, verify:

- Installation/launch/uninstall where applicable.
- New document.
- Save, close and reopen.
- Open a document with images/formulas.
- Change tracking and revision history persistence.
- Template selection/customization.
- PDF preview/export.
- Operation without network access.
- File and export error handling.
- Version and publisher/developer metadata where applicable.

### 10.4 Release artifacts and handover

Prepare:

- Final distributable(s).
- Version/release notes.
- Basic installation and first-use instructions.
- Supported/unsupported features and known limitations.
- Backup/recovery guidance for native project files.
- Test/build summary.
- Git release tag or recorded commit hash, where Git is being used.

## Evidence required

- Production build command and actual result.
- Verified path(s) and file size(s) of distributable(s).
- Clean Windows smoke-test report.
- Screenshots or concise evidence of launch, save/open, and PDF export from the packaged build.
- Offline-operation result.
- Release notes and known-limitation list.

## Exit criteria

- [ ] Tauri 2 production build succeeds.
- [ ] Intended installer/portable distribution type is unambiguously identified.
- [ ] App works outside development mode.
- [ ] Core workflow passes in the packaged app.
- [ ] PDF output passes the agreed regression checks.
- [ ] Offline operation is verified for core features.
- [ ] Release documentation and evidence are complete.
- [ ] Version 1.0 release checkpoint is recorded.

## Checkpoints

- `P10-M1`: Production Tauri build created.
- `P10-M2`: Packaged app smoke tests passed.
- `P10-M3`: Clean-environment/offline tests passed.
- `P10-M4`: Release documents and limitations completed.
- `P10-GATE`: DocStudio v1.0 release criteria met.

---

## 4. Phase Status Board

Update this table when phase status changes. Keep it consistent with the detailed phase sections above.

| Phase | Name | Status | Start date | Verified date | Evidence/commit reference | Blocker/notes |
|---|---|---|---|---|---|---|
| 01 | Empty Application Shell | VERIFIED | 2026-10-15 | 2026-10-15 | npm run build, cargo build docstudio.exe, verify_phase01.js | All Phase 01 criteria verified |
| 02 | Document Model, Metadata, Lifecycle, Renderer Proof | VERIFIED | 2026-10-15 | 2026-10-16 | P02-M1 `dc69b35`; P02-M1-R1 `89bbf3a`; P02-M2 `ff66587`; P02-M2-R1 `d7625cc`; P02-M3 `198db8f`; P02-M4 `986ce6f`; P02-GATE (branch `opencode/p02-gate-phase02-review`); P02-M5 `34848d4` | All six exit criteria verified at the 2026-10-16 gate review; the metadata-panel editing UI (§2.2) recorded as scope residue at gate time was RESOLVED by the post-gate follow-up P02-M5 (every schema-supported metadata field connected and verified) |
| 03 | Laboratory Profiles, Templates, Wizard | IN PROGRESS | 2026-10-16 | — | P03-M1 `52f904e` (branch `opencode/p03-m1-template-schema`); P03-M2 `1b361bf` (branch `opencode/p03-m2-template-chooser`); P03-M3 `a263578` (branch `opencode/p03-m3-template-library`); P03-M4 `28783b1` (branch `opencode/p03-m4-template-customization`) | P03-M1/M2/M3/M4 VERIFIED (library ships 16 templates, 2 per category across all 8; section add/rename/remove/reorder customization live on independent drafts); template save/reopen decision and exit-criteria audit remain for P03-GATE |
| 04 | Page Setup, Typography, Themes, Front Page | NOT STARTED | — | — | — | — |
| 05 | Core Modular Editor | NOT STARTED | — | — | — | — |
| 06 | Headers/Footers and Specialized Blocks | NOT STARTED | — | — | — | — |
| 07 | Track Changes and Revision History | NOT STARTED | — | — | — | — |
| 08 | Pagination, Preview, PDF Export | NOT STARTED | — | — | — | — |
| 09 | Statistics, Usability, Recovery, Regression | NOT STARTED | — | — | — | — |
| 10 | Windows Packaging and Release | NOT STARTED | — | — | — | — |

## 5. Current Minor Checkpoint Board

Add, update, or remove rows as tasks are completed. Use real dates and links/paths when available.

| Checkpoint ID | Description | Status | Evidence | Commit/reference | Notes |
|---|---|---|---|---|---|
| `P01-M1` | React + TypeScript + Vite project bootstrap | VERIFIED | `npm run build` passed in 953ms; dist/ generated | Local bootstrap | Vite 6 + React 18 + TS |
| `P01-M2` | Three-column workspace (25%/35%/40%) and Topbar | VERIFIED | CSS Grid layout verified; Topbar actions wired | Workspace.css / Topbar.tsx | Independent scrolling, honest disabled actions |
| `P01-M3` | Interface appearance modes & collapsible panels | VERIFIED | Multicolor, Light, Dark themes; 6 collapsible sections | theme.css / LeftPanel.tsx | Persistent localStorage theme switch |
| `P01-GATE` | Phase 01 Empty Application Shell Gate | VERIFIED | `cargo build` (`docstudio.exe`, 13.4MB), `verify_phase01.js` | src-tauri/target/debug/docstudio.exe | Phase 01 complete |
| `P02-M1` | Document schema and defaults (schema v1) | VERIFIED | `npm run build` exit 0 (41 modules) | `dc69b35` | Schema-only checkpoint; types/defaults, no UI wiring |
| `P02-M1-R1` | Schema review corrections | VERIFIED | Review fixes + build | `89bbf3a` | Schema corrections before persistence work |
| `P02-M2` | Native `.docstudio` save/open round-trip | VERIFIED | `verify:p02-m2` 11/11; `cargo check` ok; manual save/open by owner | `ff66587` | JSON v1 format + structural validator + narrow fs scope |
| `P02-M2-R1` | Filesystem scope outside `$HOME` via dialog grants | VERIFIED | Manual dialog-grant verification (read/write outside `$HOME`) | `d7625cc` | `$HOME/**` capability unchanged; per-session dialog grants |
| `P02-M3` | Document lifecycle + unsaved-change handling | VERIFIED | `verify:p02-m3` 12/12; manual 10-scenario test (owner) | `198db8f` | New/Duplicate/Clear/Reset/Save guard flows |
| `P02-M4` | Multi-page rendering + PDF proof of concept | VERIFIED | `verify:p02-m4` 9/9; 3-page A4 artifact; manual 3-way preview/export comparison (owner) | `986ce6f` | Renderer architecture decision (DEC-001); 2 manual-test defects fixed |
| `P02-GATE` | Phase 02 exit-criteria review | VERIFIED | Gate rerun 2026-10-16: build exit 0; 11/11 + 12/12 + 9/9; artifact validated (13,854 bytes, 3 pages) | Branch `opencode/p02-gate-phase02-review` (`0be6e54`) | All six exit criteria PASS; metadata-panel UI scope residue recorded |
| `P02-M5` | Document metadata panel editing foundation (post-gate follow-up) | VERIFIED | `verify:p02-m5` 14/14; regression 11/11 + 12/12 + 9/9; build exit 0; manual 11-scenario metadata test (owner: "working ok") | `34848d4` (branch `opencode/p02-m5-metadata-panel`) | Closes the P02-GATE §2.2 residue; no schema change |
| `P03-M1` | Versioned template data model (schema v1, factories, serializer/validator, example fixture) | VERIFIED | `verify:p03-m1` 14/14; regression 11/11 + 12/12 + 9/9 + 14/14; build exit 0 | `52f904e` (branch `opencode/p03-m1-template-schema`) | Template schema version independent of document schema; `.dstemplate` format; no lab-profile/chooser/library work yet |
| `P03-M2` | Template chooser, document initialization, laboratory profile foundation | VERIFIED | `verify:p03-m2` 18/18; regression 11/11 + 12/12 + 9/9 + 14/14; build exit 0; live `npx tauri dev` review (agent-driven, 0 console errors) | `1b361bf` (branch `opencode/p03-m2-template-chooser`) | Precedence policy (app defaults → template defaults → saved profile wins); guarded replacement via pure `resolveChooserSelection`; `localStorage` profile persistence; row added retroactively in the P03-M3 docs pass (it was missed on the board at P03-M2 time) |
| `P03-M3` | Core laboratory and administrative template library (16 built-in templates, 2 per category × 8) | VERIFIED | `verify:p03-m3` 18/18; regression 11/11 + 12/12 + 9/9 + 14/14 + 14/14 + 18/18; build exit 0; live `npx tauri dev` review (agent-driven, 0 console errors) | `a263578` (branch `opencode/p03-m3-template-library`) | Authoritative lazy canonical catalog + deep-clone retrieval (stable IDs); `verify:p03-m2` fixtures moved from list-position to id-based lookup (documented, contracts unweakened); section customization (P03-M4) still pending |
| `P03-M4` | Template section customization (add, rename, remove, reorder, edit description/prompt on independent per-template drafts) | VERIFIED | `verify:p03-m4` 22/22; regression 11/11 + 12/12 + 9/9 + 14/14 + 14/14 + 18/18 + 18/18; build exit 0; live `npx tauri dev` review (agent-driven, 0 console errors) | `28783b1` (branch `opencode/p03-m4-template-customization`) | Pure draft service with deterministic error codes and ID-addressed edits; drafts live for the chooser session only (no custom-template persistence yet); Create instantiates the draft through the unchanged P03-M2 precedence flow |

## 6. Decision Log

Record decisions that influence architecture, dependencies, supported behavior, or release scope. For each decision, record the context, options considered, decision, rationale, date, and impact.

| Decision ID | Date | Topic | Decision | Rationale/evidence | Impact |
|---|---|---|---|---|---|
| DEC-001 | 2026-10-15 | PDF preview/export architecture | **SELECTED:** `@react-pdf/renderer` 4.9.0 (MIT) for PDF generation and `react-pdf` 10.5.0 / pdfjs-dist 5.4.296 (Apache-2.0) viewer for preview — the same rendered bytes serve both preview and export (confirmed by P02-M4: deterministic byte-identical re-render, 3-page A4 artifact, 3-way preview/artifact/external-viewer comparison) | Pure JS/WASM, fully offline after install; React component model; Yoga pagination with `break`/`fixed`; standard-14 fonts (license-clean); headless Node API enabled automated verification. Rejected: pagedjs (stale, no offline automated print-to-PDF from Tauri/WebView2), Vivliostyle (AGPL-3.0), pdfmake (non-React, no capability gain), react-pdf v11 (needs React 19). Full record in the P02-M4 checkpoint entry | Feasibility proven (R-001 mitigated). **Remaining Phase 08 fidelity work:** tables split across pages with repeated header rows, all 21 block types, 10 body + 10 cover themes, running-header content flow, footnotes/TOC/cross-references, PDF/A option, embeddable-font licensing, large-document performance; keep the `blob:` object URL viewer pattern (pdf.js buffer detach + StrictMode findings) |
| DEC-002 | 2026-10-15 | Native `.docstudio` file packaging | **DECIDED:** a `.docstudio` file (v1) is a single UTF-8, pretty-printed JSON document equal to exactly one `DocStudioDocument`, with assets embedded as base64 records; `schemaVersion` (currently 1) governs compatibility — equal opens, newer rejected (`unsupported-version`), older rejected (`no-migration`) until a migration module exists | Human-readable and diff-able; matches schema v1 asset-as-base64 design; full-object serialization guarantees byte-stable save→open round-trip (verify:p02-m2 11/11); structural validation on read/write rejects invalid files whole; format documented in the `src/services/document-file.ts` header. Archive-style packaging remains possible later under a schema version bump | Affects persistence and compatibility; every breaking schema change requires a version increment plus a migration module; a future archive format is a versioned evolution, not a re-design |
| DEC-003 | Pending | DOCX import/export scope | Evaluate during Phase 08; PDF/native project reliability take priority | DOCX fidelity and maintenance cost must be evidence-based | May be included or explicitly deferred for v1.0 |
| DEC-004 | Pending | Windows distribution form | Confirm installer vs portable executable before Phase 10 | These are different distribution models | Affects packaging and release instructions |

## 7. Blocker and Risk Register

Keep this list current. Add an owner/decision needed when useful.

| ID | Risk/blocker | Impact | Mitigation/evidence required | Status |
|---|---|---|---|---|
| R-001 | Preview and exported PDF may differ in page breaks, fonts, or element positions | Critical | Prove a multi-page renderer in Phase 02; validate against actual PDFs in Phase 08 | **MITIGATED (P02-M4, 2026-10-15)** — same-bytes preview/export architecture (DEC-001) demonstrated on a 3-page A4 artifact with recorded 3-way comparison; production-fidelity validation (table page-splitting, all block types, themes, fonts, large documents) remains assigned to Phase 08 — not fully resolved |
| R-002 | Too many features attempted in one agent task may lead to broad changes and difficult debugging | High | Use small scoped tasks, inspect diffs, verify each checkpoint, and commit stable milestones | OPEN |
| R-003 | Revision/track-change data can increase project-file size and model complexity | Medium | Define scope and persistence strategy in Phase 07; test realistic histories | OPEN |
| R-004 | Fonts and images may not be available when a project moves to another computer | High | Define asset handling, fallback fonts and PDF font behavior; test on clean Windows setup | OPEN |
| R-005 | Ten cover themes and ten body themes may become superficial palette variations | High | Require distinct structural visual evidence for each theme in Phase 04 | OPEN |
| R-006 | DOCX conversion may fail to preserve complex layouts | Medium | Assess realistic files and document limitations; do not compromise native/PDF behavior | OPEN |

## 8. Checkpoint Log — Append-Only Progress History

Add one entry every time a major gate or meaningful minor checkpoint is reached. Do not replace past entries with a new summary. Corrections should be appended with a reference to the entry being corrected.

### Checkpoint entry template

Copy this template for each new checkpoint:

```markdown
### [YYYY-MM-DD] — [MAJOR/MINOR] [Checkpoint ID]: [Short title]

- **Phase:** [Phase number and name]
- **Status:** [VERIFIED / IMPLEMENTED — NOT VERIFIED / FAILED / BLOCKED]
- **Scope completed:**
  - [Specific item]
- **Evidence:**
  - [Test command and actual result]
  - [Screenshot, artifact, output file, or path]
- **Validation performed:**
  - [What was actually tested]
- **Not completed / limitations:**
  - [List honestly, or write “None identified in this checkpoint”]
- **Decisions made:**
  - [Decision ID or “None”]
- **Commit/reference:** [Git hash, pull request, or “Not available”]
- **Next action:** [Single next useful step]
```

### History

### 2026-10-15 — [MINOR] P01-M1: React, TypeScript, Vite, and Tauri 2 Project Foundation

- **Phase:** Phase 01 — Empty Application Shell
- **Status:** VERIFIED
- **Scope completed:**
  - Initialized React 18 + TypeScript + Vite project directly in `C:\Projects\DocStudio`.
  - Configured Tauri 2 (`src-tauri` with `tauri.conf.json`, `Cargo.toml`, build script, and Windows icons).
  - Preserved existing Markdown project specifications (`AGENTS.md`, `project_details.md`, `project_roadmap.md`).
  - Configured minimal, strictly scoped dependencies (`@tauri-apps/api`, `@tauri-apps/cli`, `react`, `react-dom`, `vite`, `typescript`).
- **Evidence:**
  - `npm run build`: `tsc && vite build` built 41 modules in 953ms; generated `dist/index.html` and bundled assets.
  - `tauri info`: verified Windows 11 x64, WebView2 155.0.4283.45, MSVC Build Tools 2026, Rust 1.98.1, Cargo 1.98.1.
- **Validation performed:**
  - Verified local environment toolchain, node build execution, and Tauri CLI initialization without errors.
- **Not completed / limitations:**
  - None identified in this checkpoint.
- **Decisions made:**
  - Zero heavy external component libraries used; implemented clean, lightweight CSS variable theme system and inline accessible SVGs.
- **Commit/reference:** Local verified bootstrap
- **Next action:** Implement Topbar and 3-column workspace layout (`P01-M2`).

---

### 2026-10-15 — [MINOR] P01-M2: Topbar and 3-Column Workspace Layout

- **Phase:** Phase 01 — Empty Application Shell
- **Status:** VERIFIED
- **Scope completed:**
  - Topbar left: DocStudio logo, app name with v1.0 tag, visual separator, active session status pill (`New`), active document name (`Untitled-1.docstudio`).
  - Topbar right: 5 required action buttons (`New`, `Save`, `Open`, `Export`, `Clear Document`), styled with icons, focus states, and honest disabled state.
  - Workspace: CSS Grid 3-column layout matching 25% (Left), 35% (Middle), 40% (Right) proportions with `minmax(260px, 25fr) minmax(360px, 35fr) minmax(400px, 40fr)`.
  - Independent scrolling for all three columns and window overflow protection.
- **Evidence:**
  - `verify_phase01.js`: verified all 5 topbar actions, active status badge, and CSS Grid proportions.
  - Build test: `npm run build` passed with 0 errors.
- **Validation performed:**
  - Confirmed no horizontal overflow, correct layout proportions, and proper button disabled attributes.
- **Not completed / limitations:**
  - Document lifecycle and persistence actions intentionally disabled per Phase 01 non-destructive requirements.
- **Decisions made:**
  - None.
- **Commit/reference:** Local verified
- **Next action:** Implement 3 application appearance modes and LeftPanel collapsible sections (`P01-M3`).

---

### 2026-10-15 — [MINOR] P01-M3: Interface Appearance Modes and Left-Column Collapsible Sections

- **Phase:** Phase 01 — Empty Application Shell
- **Status:** VERIFIED
- **Scope completed:**
  - Implemented 3 switchable application interface modes: `Multicolor` (laboratory jewel-slate palette), `Light` (clean neutral slate), and `Dark` (pro charcoal).
  - Mode switcher in Topbar dynamically sets `data-theme` on root element and persists preference in `localStorage`.
  - Left panel: 6 collapsible sections (Document Information, Front Page, Page & Typography, Header & Footer, Document Statistics, Document Actions).
  - Smooth chevron rotation, section badges, Expand All / Collapse All actions, and individual accordion toggles.
  - Middle panel: structured modular block placeholder cards indicating Phase 05 scope.
  - Right panel: page-shaped container with realistic A4 aspect ratio, live margin guide toggle, Fit Width/Fit Page modes, and Phase 08 pagination engine tag.
- **Evidence:**
  - `verify_phase01.js`: verified 3 theme selectors, 6 collapsible sections, and preview controls.
  - Checked theme variables in `src/styles/theme.css`.
- **Validation performed:**
  - Verified expand/collapse interactions and state preservation across theme toggles.
- **Not completed / limitations:**
  - None.
- **Decisions made:**
  - Stored interface theme preference independently from future document formatting per `project_details.md` Section 5.2.
- **Commit/reference:** Local verified
- **Next action:** Verify Phase 01 Gate (`P01-GATE`).

---

### 2026-10-15 — [MAJOR] P01-GATE: Phase 01 Empty Application Shell Exit Gate

- **Phase:** Phase 01 — Empty Application Shell
- **Status:** VERIFIED
- **Scope completed:**
  - Verified all exit criteria for Phase 01.
  - Frontend production build (`tsc && vite build`) passed with zero errors.
  - Desktop Rust backend compiled with MSVC; `cargo build` generated `src-tauri\target\debug\docstudio.exe` (13.4 MB).
  - All Phase 01 acceptance criteria satisfied honestly without false simulation.
- **Evidence:**
  - `npm run build`: 41 modules transformed, built in 953ms.
  - `cargo check`: finished in 0.92s.
  - `cargo build`: finished in 4m 19s; `docstudio.exe` binary created.
  - `tauri info`: verified all Windows toolchain prerequisites.
  - `verify_phase01.js`: passed 100% of structural checks.
- **Validation performed:**
  - Checked all UI elements, layout proportions, appearance modes, collapsible panels, and build artifacts.
- **Not completed / limitations:**
  - Document editing, file saving/opening, and PDF export are deferred to their designated roadmap phases (Phases 02, 05, and 08).
- **Decisions made:**
  - DEC-001 through DEC-004 remain pending as planned for later phases.
- **Commit/reference:** Local verified
- **Next action:** Proceed to Phase 02 (Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept) upon user instruction.

---

---

### 2026-10-15 — [MINOR] P02-M1: Document Schema and Defaults

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED
- **Scope completed:**
  - Created `src/types/document.ts` — authoritative, versioned document schema (schema version 1).
    - Primitive aliases: `ISODateString`, `DocUUID`.
    - `DOCSTUDIO_SCHEMA_VERSION = 1 as const` sentinel.
    - `DocumentMetadata` with 19 standard fields + `customFields: CustomMetadataField[]`.
    - `EmbeddedLabProfile` — snapshot copied at creation; does not mutate with the live global profile.
    - `PageSetup`, `PageMargins` (with `MarginPreset`), `PageSize`, `PageOrientation`.
    - `TypographySettings` — font family, fallbacks, size, line-height, paragraph spacing.
    - `PageTypographySettings` — body theme, monochrome toggle, display-header toggle, typography.
    - `BodyThemeId` — 10 body theme literals.
    - `FrontPageSettings` — cover enabled, theme, monochrome, visible fields, synopsis, logo/background assets, frame config.
    - `CoverThemeId` — 10 cover theme literals.
    - `CoverVisibleMetadataField` — union of `keyof Pick<DocumentMetadata, …>` and `` `custom:${DocUUID}` `` for user-defined fields.
    - `CoverFrameSettings` — border style, thickness, color, corner radius, inset.
    - `HeaderFooterSettings`, `HeaderFooterBand`, `HeaderFooterRow`, `HeaderFooterCell`, `WatermarkSettings`.
    - `AssetRecord` — binary embedded as `base64Data`; MIME-typed; referenced by UUID.
    - `ContentBlock` envelope with stable `id: DocUUID` and `data: AnyBlockData`.
    - `SavedRevision` stub — supports Phase 07 revision history without a breaking schema change.
    - `DocStudioDocument` root interface — full document envelope.
  - Created `src/types/blocks.ts` — discriminated union `AnyBlockData` with 21 block types.
    - Shared `InlineSpan` rich-text primitive (bold, italic, underline, strikethrough, color, highlight, href, verticalAlign, code).
    - Standard blocks: `HeadingBlockData`, `ParagraphBlockData`, `CalloutBlockData`, `ListBlockData`, `TableBlockData`, `FormulaBlockData`, `ImageBlockData`, `SignatureBlockData`, `HorizontalLineBlockData`, `PageBreakBlockData`, `SectionBreakBlockData`, `MetadataBlockData`, `RevisionHistoryBlockData`.
    - Lab-specific blocks: `ProcedureStepBlockData`, `EquipmentListBlockData`, `ObservationBlockData`, `MeasurementBlockData`, `CalculationBlockData`, `AcceptanceCriteriaBlockData`, `ReferenceBlockData`, `ExhibitBlockData`.
    - `BlockType` helper alias derived from the union.
  - Created `src/types/defaults.ts` — pure factory functions; no side-effects; no DOM/React imports.
    - `newUUID()` — delegates to `crypto.randomUUID()` (available in WebView2/Chromium).
    - `nowISO()` — convenience wrapper for `new Date().toISOString()`.
    - `createDefaultMargins()`, `createDefaultPageSetup()`, `createDefaultTypography()`, `createDefaultPageTypography()`.
    - `createDefaultCoverFrame()`, `createDefaultFrontPage()`.
    - `createDefaultWatermark()`, `createDefaultHeader()`, `createDefaultFooter()`, `createDefaultHeaderFooter()`.
    - `createDefaultMetadata(now)`, `createDefaultLabProfile()`.
    - `createDefaultDocument(id, now)` — returns a fully valid `DocStudioDocument`.
  - Updated `src/types/index.ts` — added re-exports `export * from './document'; export * from './blocks'; export * from './defaults';` alongside existing Phase 01 UI types (`ThemeMode`, `DocumentSessionStatus`, `SectionState`).
- **Evidence:**
  - `npm run build` (tsc && vite build) — exit code 0, zero TypeScript errors, 41 modules transformed, built in 912ms.
  - All three type files contain no DOM, React, or CSS imports.
  - All types are JSON-serializable (no `Date` objects, no functions, no circular references).
- **Files created/modified:**
  - `src/types/blocks.ts` — CREATED (new, 348 lines)
  - `src/types/defaults.ts` — CREATED (new, 218 lines)
  - `src/types/document.ts` — carried from prior session (603 lines)
  - `src/types/index.ts` — MODIFIED (added Phase 02 re-exports)
- **Not completed / limitations:**
  - No UI wiring; this checkpoint is schema-only per scope.
  - No persistence, editor, or renderer changes — deferred to P02-M2 through P02-M4.
- **Decisions made:**
  - Rich text stored as `InlineSpan[]` arrays (not ProseMirror/Slate JSON) to avoid editor library coupling at schema level.
  - Formula content stored as raw LaTeX string; renderer library TBD in Phase 04.
  - Assets stored as `base64Data` in JSON for schema v1; Phase 14 may migrate to zip bundle.
  - `DocumentMetadataStatus` is an open string union to allow custom document-status values.
- **Commit/reference:** Local verified
- **Next action:** Proceed to P02-M2 (Native project save/open round-trip) upon user instruction.

---

### 2026-10-15 — [MINOR] P02-M1-R1: Schema Review Corrections

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED
- **Scope completed (corrections A–H implemented):**
  - **A. Header/footer defaults:** `createDefaultHeader()` and `createDefaultFooter()` now produce one row with two cells and `columnCount: 2`, so the row cell count, `columnCount` and the spec §9 default layout agree. Corrected the misleading `makeSimpleRow` comment ("single-cell") and the header/footer comment-versus-content mismatches (comment claimed a title token while content was `{documentId}`; footer comment claimed a page number while the cell was empty). Page-number behavior is now explicit: the right cell carries a `{pageNumber}` token formatted by the band's `pageNumberFormat` (`'Page X of Y'` by default; `'none'` renders empty).
  - **B. Paragraph alignment:** added `ParagraphAlignment` (`'left' | 'center' | 'right' | 'justify'`) in `src/types/blocks.ts` and used it for `ParagraphBlockData.hAlign`. `HAlignment` stays `'left' | 'center' | 'right'` and is documented as excluding justification for headings, table cells, images, formulae, and header/footer cells.
  - **C. Image block schema:** added optional `ImageCrop { x, y, width, height }` with a documented normalized-fraction coordinate system (fractions of the source image's natural dimensions, origin top-left) and `CaptionPlacement` (`'top' | 'bottom'`) on `ImageItem` as optional `captionPlacement` (omitted = `'bottom'`). Existing asset, layout, `widthFraction` and `hAlign` fields preserved unchanged.
  - **D. Signature block schema:** added optional `department` to `Signer`, plus optional `designation` so the required name-or-designation rule has a field to reference alongside `name`. Documented on `SignatureBlockData` that a block supports one, two or three signers, and that every signer must supply a `name` or a `designation` — recorded as a schema-level contract for the future UI/validation layer, with no validation dependency added.
  - **E. List block schema:** extended `BulletStyle` with `'arrow'` (arrowhead) alongside existing values; documented `disc` = solid (filled) bullet, `circle` = hollow/circular (open) marker, `square` = solid square, `dash` = dash/hyphen.
  - **F. Cover-page metadata selector:** `CoverVisibleMetadataField` now covers every scalar `DocumentMetadata` field from spec §6 — required fields including `createdAt` and `modifiedAt`, optional fields, and all additional recommended fields (`amendmentNumber`, `reviewDate`, `clauseReferences`, `supersedes` were previously missing). User-defined fields remain selectable via `custom:${DocUUID}`.
  - **G. Cargo manifest:** reverted the unrelated empty `features = []` entries; `src-tauri/Cargo.toml` now matches commit `64b1920` exactly. No Tauri filesystem dependencies were introduced.
  - **H. Comment/roadmap consistency:** replaced the stale "Phase 14 may move assets to a zip/archive bundle" comment with wording consistent with the ten-phase roadmap ("a future schema revision beyond the v1.0 ten-phase roadmap"); added this checkpoint entry and updated the summary/Phase 02 checkpoint list while preserving the original P02-M1 record.
- **Evidence (checks actually executed):**
  - `npm run build` (`tsc && vite build`) — exit code 0, zero TypeScript errors, 41 modules transformed, built in 854ms.
  - Compiled-factory inspection (`npx tsc` → Node script over `src/types/defaults.ts`): header `{ rows: 1, cells: 2, columnCount: 2, contents: ["{documentId}", "{pageNumber}"], aligns: ["left", "right"] }`; footer `{ rows: 1, cells: 2, columnCount: 2, contents: ["{organizationName}", "{pageNumber}"], aligns: ["left", "right"] }`; `createDefaultDocument()` still returns a valid `DocStudio/v1` document.
  - `cargo check` (src-tauri, restored manifest) — finished in 5.06s, no errors.
  - `git diff 64b1920 -- src-tauri/Cargo.toml` — empty (content identical to the prior manifest).
- **Changes implemented vs. tests executed:** corrections A–H are implemented as described above; the executed checks are exactly the four commands/inspections listed under Evidence. No unit-test framework exists in the repository and none was introduced.
- **Not completed / limitations:**
  - No runtime enforcement yet of the 1–3 signer count, the name-or-designation rule, or the header/footer `columnCount`/row-cell agreement — these are documented schema contracts only.
  - No serialization, document lifecycle, UI control, or PDF rendering changes — out of scope for this correction checkpoint (P02-M2 onward).
  - No automated test suite; verification is limited to the type-check/build, factory inspection, and cargo check listed above.
- **Decisions made:**
  - Added an explicit optional `designation` field to `Signer` so the spec's "name or designation required" rule is representable (the existing `role` label, e.g. "Prepared by", is not a designation).
  - The P02-M1 decision-log note "Phase 14 may migrate to zip bundle" refers to a post-v1.0 schema revision, not a roadmap phase; the original P02-M1 entry is preserved as history.
- **Commit/reference:** Uncommitted working-tree changes on top of `dc69b35` (not pushed, per task scope)
- **Next action:** Proceed to P02-M2 (Native project save/open round-trip) upon user instruction.

---

### 2026-10-15 — [MINOR] P02-M2: Native `.docstudio` Project Save/Open Round-Trip

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (automated checks + manual in-app verification by the project owner)
- **Scope completed:**
  - **Native format (v1):** a `.docstudio` project is a single UTF-8, pretty-printed JSON document equal to one `DocStudioDocument`. Format and compatibility policy documented in the header comment of `src/services/document-file.ts`: `schemaVersion == 1` opens; newer → rejected (`unsupported-version`); older → rejected (`no-migration`) until a migration module exists.
  - **Created `src/services/document-file.ts`** (pure, no Tauri/React imports):
    - `serializeDocument()` validates before writing, so a structurally invalid document can never reach disk; `deserializeDocument()` parses then validates — never a blind cast.
    - `validateDocument()` runtime checks: `DocStudio` signature, schema-version policy, document ID, required metadata primitives, lab-profile snapshot, page setup/margins, typography, front-page settings incl. frame, header/footer band+row+cell envelopes, watermark, block envelopes with supported discriminants (new runtime `BLOCK_TYPES` list in `src/types/blocks.ts`, 21 types, `satisfies`-checked), and asset records including key/id agreement. Unknown fields are preserved, never stripped.
    - `DocumentFileError` with codes `invalid-json | unsupported-version | no-migration | invalid-structure | io-read | io-write`, user-facing messages plus diagnostic `detail`; `defaultProjectFileName()` helper.
  - **Created `src/services/document-io.ts`:** Tauri dialog/fs wrapper — `saveProjectText()` (known path → direct write, no dialog; otherwise native Save dialog filtered to `.docstudio` with a title-based default name and extension guard; cancel → `null`), `readProjectText()` (native Open dialog filtered to `.docstudio`; cancel → `null`), I/O failures mapped to `DocumentFileError('io-read' | 'io-write')`.
  - **Connected the UI:** `App.tsx` initializes from `createDefaultDocument(newUUID(), nowISO())`; Save/Open handlers wire real session state (active file path, filename, `New`/`Saved` status); the active document is replaced only after successful validation; failures show a dismissible error banner (`App.css`) without touching the open document. `Topbar.tsx` gained `onSave`/`onOpen` props; New/Export/Clear remain honestly disabled. Three-column layout and themes untouched.
  - **Tauri 2 wiring:** registered `tauri-plugin-dialog` and `tauri-plugin-fs` in `src-tauri/src/lib.rs`; added both crates to `src-tauri/Cargo.toml`; `capabilities/default.json` grants `dialog:allow-open`, `dialog:allow-save`, `fs:allow-read-text-file`, `fs:allow-write-text-file` and an `fs:scope` limited to `$HOME/**` (no unrestricted filesystem access).
  - **Verification script `verify_p02_m2.mjs`** (npm script `verify:p02-m2`): compiles the actual `document-file.ts` + type modules with tsc and exercises them in Node — no testing framework added.
- **Evidence (commands actually executed):**
  - `npm run build` — exit code 0, zero TypeScript errors, 52 modules transformed, built in 911ms.
  - `npm run verify:p02-m2` — **11 passed, 0 failed**: default round-trip (+ byte-stable re-serialization); metadata/lab profile/page setup/typography/front page/header-footer unchanged; 10 representative blocks (heading, justified paragraph, arrow-bullet list, 2×2 table, formula, cropped image with top caption, 3-signer signature, procedure-step, measurement, acceptance-criteria) deep-equal; asset record + base64 payload preserved; wrong signature, malformed JSON, 10 missing/invalid-structure variants, future schemaVersion 2, non-integer/zero/string versions all rejected with correct error codes; failed load leaves the active document byte-identical; `serializeDocument` refuses invalid in-memory documents; filename sanitization.
  - `cargo check` (src-tauri) — finished in 28.79s, no errors (plugin deps resolved: tauri-plugin-dialog 2.8.3, tauri-plugin-fs 2.7.1).
  - `npx tauri dev` — built in 2m50s, app launched, dev server HTTP 200, no plugin/capability errors.
  - **Manual verification (project owner, in the running dev app):** saved a real `.docstudio` file via the native dialog, topbar filename/status updated to Saved, second Save wrote back without prompting, Open restored the project, cancel handled cleanly. Owner's report: "no errors, working ok."
- **Dependencies / permissions added:**
  - npm: `@tauri-apps/plugin-dialog` ^2.8.3, `@tauri-apps/plugin-fs` ^2.7.1. Rust: `tauri-plugin-dialog` 2.8.3, `tauri-plugin-fs` 2.7.1 (+ lockfile updates).
  - Capability permissions: dialog open/save, fs read/write text files, fs scope `$HOME/**`.
- **Not completed / limitations:**
  - Unsaved-changes warning before Open replaces a modified document is deferred to P02-M3 (no editing exists yet; status is currently only New/Saved).
  - Autosave/recovery (spec §14.3) not started (P02-M3/Phase 09).
  - Filesystem scope is the user's home directory; saving/opening outside it (e.g. another drive) fails with a clear I/O error and needs a scope revisit if required.
  - Block validation is envelope-level (ID, spacing, supported discriminant) plus full top-level structural checks; exhaustive per-block-field validation is deferred.
  - New/Duplicate/Clear/Reset actions, track changes, PDF and DOCX remain out of scope.
- **Decisions made:**
  - JSON v1 chosen over an archive format: human-readable/diff-able, matches schema v1 asset-as-base64 design; packaging can evolve under a version bump.
  - Hand-rolled structural validator — no validation framework introduced.
  - Session model: `activeFilePath` + `activeFileName` + `sessionStatus` live in App state for now; centralized document state management belongs to P02-M3.
- **Commit/reference:** `opencode/p02-m2-native-save-open` (this checkpoint's commit; based on `origin/main` `b56bc59`)
- **Next action:** Proceed to P02-M3 (Document lifecycle actions: New/Duplicate/Clear/Reset + unsaved-changes handling) upon user instruction.

---

### 2026-10-15 — [MINOR] P02-M2-R1: Filesystem Scope Verification for Paths Outside `$HOME`

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (static source inspection + real Windows/Tauri integration testing)
- **Scope completed:**
  - **Static inspection of the installed dialog plugin** (`tauri-plugin-dialog` 2.8.3, cargo registry source): its `open` command grants the exact picked file path to the fs plugin's runtime scope (`window.try_fs_scope().allow_file(&path)`) before returning it, and its `save` command does the same for the chosen save target before the frontend writes to it. Grants are **per-file and per-session** — the narrowest possible grant, so the `$HOME/**` capability scope need not be broadened for user-picked paths.
  - **Inspected the current implementation** (`src/services/document-io.ts`, `document-file.ts`, `App.tsx`, `capabilities/default.json`, `lib.rs`, `Cargo.toml`): the dialog-then-read/write flow matches the plugin's grant model; no code or configuration defect found.
  - **Documentation only:** added a "Filesystem scope (verified in P02-M2-R1)" note to the `src/services/document-io.ts` module header warning future maintainers not to broaden the capability scope. **No permission/configuration change was necessary or made.**
- **Integration test evidence (real Windows, `npx tauri dev`, native dialogs, manual execution by the project owner; agent drove setup/fixture creation):**
  - Fixture files created with the actual serialization module in `C:\Projects\DocStudio-Test\` (outside home `C:\Users\Ikram`): `scope-outside-home.docstudio` (valid, round-trip verified via `deserializeDocument`), `malformed.docstudio` (broken JSON).
  - Scenario 1 — save inside home (Desktop): **PASS**.
  - Scenario 2/3 — silent re-save without dialog: **PASS**.
  - Scenario 3/4 — open + re-save a file outside `$HOME` (`C:\Projects\DocStudio-Test\`): **PASS** (dynamic scope grant confirmed by real behavior).
  - Scenario 5 — open malformed project: error banner shown, active document unchanged: **PASS**.
  - Scenario 6 — cancel dialogs: no state change: **PASS**.
  - Scenario 7 — restart test: after full app restart, saving a new document to `C:\Projects\DocStudio-Test\scope-after-restart.docstudio` succeeded (per-session grants re-created by the new dialog pick): **PASS**.
- **Automated checks executed:**
  - `npm run build` — exit code 0, 52 modules, built in 1.09s.
  - `npm run verify:p02-m2` — 11 passed, 0 failed (no regression; no code logic changed).
  - `cargo check` — not re-run: no Rust or Tauri configuration change was made in this checkpoint.
- **Actual errors encountered:** none. No fs-scope denial (`readTextFile`/`writeTextFile` permission error) occurred in any scenario.
- **Configuration change:** none required. `fs:scope` remains `$HOME/**`; no `fs:write-all`, root, or drive-wide grant introduced.
- **Not completed / limitations:**
  - Native dialogs cannot be driven by the agent's automation; scenarios were executed manually by the project owner following the exact scripted procedure above.
  - Secondary-drive storage (D:/E:/F: exist on this machine) was not exercised; the grant is path-based rather than drive-based, but this remains unverified.
  - Files written outside `$HOME` without a prior dialog pick (e.g. a stale path after the app moves a file) remain subject to the scope — behavior unchanged and by design.
  - Local test artifacts (`C:\Projects\DocStudio-Test\*`, Desktop `scope-in-home.docstudio`) exist only on this machine and are not part of the repository.
- **Decisions made:** none new; P02-M2's narrow-scope decision is confirmed correct by evidence.
- **Commit/reference:** `opencode/p02-m2-filesystem-scope-check` (roadmap + documentation-comment commit)
- **Next action:** Proceed to P02-M3 (Document lifecycle actions) upon user instruction.

---

### 2026-10-15 — [MINOR] P02-M3: Document Lifecycle Actions and Unsaved-Change Handling

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (automated lifecycle verification + manual Windows integration test)
- **Scope completed:**
  - **New pure lifecycle layer** `src/services/document-actions.ts` (no React/Tauri imports, directly testable): `createNewDocument` (fresh UUID + timestamps, defaults), `duplicateDocument` (deep copy via JSON round-trip mirroring `.docstudio` semantics, fresh root UUID/timestamps, " (Copy)" title suffix, formal `documentId` blanked), `clearDocumentContents` (blocks removed; identity, metadata, lab profile, page/typography/front-page/header-footer/watermark settings, `savedRevisions` and `trackChangesEnabled` preserved; assets referenced only by removed blocks pruned, assets referenced by retained structures kept), `resetDocumentSettings` (page setup, page typography, front page, header/footer restored from the default factories with fresh nested IDs; content/metadata/assets preserved), `stampModifiedAt` (createdAt stable), `sessionFingerprint`/`isDirty`/`deriveSessionStatus` (baseline-comparison status derivation — never derived from file-path presence alone), and `resolveUnsavedChanges` (centralized Save/Discard/Cancel guard flow).
  - **Confirmation UI** `src/components/common/ConfirmDialog.tsx` + `.css`: accessible modal (role=dialog, aria-modal, labelled title, initial focus on first action, Escape/backdrop dismiss) with no new dependency.
  - **`src/App.tsx` rework of session state:** added a saved-baseline fingerprint (`baselineFingerprint`, advanced only after a successful save/open), derived `dirty` + `sessionStatus` on every render, guarded `handleNew`/`handleOpen` through `resolveUnsavedChanges`, new `handleDuplicate` (copies the current in-memory document, unsaved copy starts with an empty baseline so it is dirty/protected and shows Modified), confirmed `handleClear`/`handleReset`; `handleSave` now stamps `modifiedAt` before writing and returns success so the guard can abort on save cancel/failure; failed validation never replaces the active document.
  - **UI wiring:** Topbar `New` and `Clear Document` buttons enabled (with titles); Left Panel `Document Actions` section replaced its placeholder with working `Duplicate Document` and `Reset Settings to Defaults` buttons passed through `Workspace`.
  - **Verification script** `verify_p02_m3.mjs` (+ npm script `verify:p02-m3`): compiles the actual modules with tsc into a temp dir and runs 12 checks with the built-in assert module — no test framework introduced.
- **Policies documented in `document-actions.ts`:**
  - Timestamps: `createdAt` never changes; `modifiedAt` is stamped by every content/settings change AND by a successful save (project_details.md §6 policy).
  - Duplicate: formal `metadata.documentId` is blanked so a copy can never silently carry a second controlled-looking document code; block IDs preserved inside the copy.
  - Clear: saved revisions and change-tracking state are preserved (never silently discarded); asset pruning is reference-aware.
  - Session status: `Modified` whenever the fingerprint differs from the baseline; otherwise `Saved` with a file path, `New` without one; a duplicate starts with an empty baseline so it is immediately dirty.
- **Automated checks executed:**
  - `npm run build` — exit code 0, 54 modules, built in 1.10s.
  - `npm run verify:p02-m3` — 12 passed, 0 failed (new/ID freshness, duplicate data preservation + independent object graph, mutation isolation, clear preservation matrix, reset scope + fresh nested IDs, timestamp/status transitions, unchanged-not-falsely-modified, change detection, cancel aborts, save failure/cancel blocks replacement, failed-open preserves active document, schema validity of every transformation).
  - `npm run verify:p02-m2` — 11 passed, 0 failed (no P02-M2 regression).
  - `cargo check` — not run: no Rust code, Tauri plugin, or capability/permission change was made in this checkpoint (frontend-only + TypeScript verification).
- **Manual integration test evidence (real Windows, `npx tauri dev`, executed by the project owner; agent drove build/fixture setup):** 10 scripted scenarios — startup New state; Duplicate (filename/status change, Modified); Save the copy; Clear confirmation Cancel vs Clear Contents; Unsaved-changes modal Cancel; guard-Save then Open; guard-Discard then malformed-file rejection with banner and preserved document; Reset Settings confirmed; New with dirty state via Discard; modal Escape/backdrop dismissal — **all passed** (owner: "verified, working ok"). Existing native Save/Open behavior verified unchanged within the same run.
- **Actual errors encountered during development:** one broken JSDoc comment and one misplaced import in `App.tsx` during implementation (caught by `npm run build`, fixed, build clean); no runtime errors during manual testing.
- **Decisions made:**
  - Duplicate blanks the formal `documentId` (title gets " (Copy)") rather than auto-generating a look-alike code — the user assigns a new formal ID deliberately.
  - Clear prunes only assets unreferenced by retained structures; revisions and track-changes state are kept.
  - A duplicated document displays status `Modified` (empty baseline) so its work is protected by the unsaved guard immediately.
  - Save success is signalled by a boolean from `handleSave` so the unsaved guard can abort a pending replacement on save cancel/failure.
- **Not completed / limitations:**
  - No content-editing UI exists yet, so in-session dirty states are reachable only via Clear/Reset/Duplicate/Save flows; the fingerprint mechanism covers future editors unchanged.
  - Fingerprint comparison is plain `JSON.stringify` key-order-sensitive; safe within a session (all mutations build new objects) but not a canonical-JSON comparison across files.
  - `Duplicate`/`Reset` live in the Left Panel actions section; `Save As` is not implemented (deferred; current save dialog covers first save, and re-save writes to the associated path).
  - Confirmation modal has no focus-trap beyond initial focus + Escape; sufficient for current scope.
  - Local test artifacts (`C:\Projects\DocStudio-Test\*`, Desktop copies) exist only on this machine and are not part of the repository.
- **Commit/reference:** `opencode/p02-m3-document-lifecycle` (implementation + verification + roadmap commit)
- **Next action:** Proceed to P02-M4 (Multi-page PDF/rendering proof of concept — the Phase 02 critical gate) upon user instruction.

---

### 2026-10-15 — [MAJOR] P02-M4: Multi-page Rendering and PDF Proof of Concept

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (automated rendering verification + manual Windows integration test)
- **Scope completed:**
  - **Deterministic multi-page fixture** `src/renderer/poc/poc-fixture.ts`: fixed UUIDs/timestamps, A4 pages with 25 mm margins, 10 paragraphs (long enough to overflow page 1 mid-sentence), one explicit page-break block, a 6×4 table with caption, and one image block embedding a locally generated 400×160 PNG (`fixtures/p02-m4/balance-calibration-chart.png`) as base64 — matching the real `AssetRecord.base64Data` model.
  - **Translation layer** `src/renderer/poc/poc-document.tsx`: maps fixture blocks (heading, paragraph, page-break, table, image) to `@react-pdf/renderer` primitives; unmapped block types render a visible `"[not yet mapped]"` marker so nothing fails silently.
  - **Render service** `src/renderer/poc/poc-render.ts`: isomorphic single source of bytes — Node collects the pdfkit stream via async iteration, browser uses `toBlob()`; **preview and export consume the same byte array**.
  - **In-app viewer** `src/renderer/poc/PocViewer.tsx` + `.css`: PDF.js (`react-pdf` 10.5.0, local bundled worker) paginated preview + "Export PDF…" writing the previewed bytes through `src/services/pdf-export-io.ts` (native save dialog + `fs writeFile`); wired into `PreviewPanel` behind a "Renderer PoC" toggle (PoC-only, no document-model coupling).
  - **Verification harness** `verify_p02_m4.mjs` (npm script `verify:p02-m4`): compiles the real modules with `tsc` into `node_modules/.cache/ds-p02-m4-verify` (deliberately **not** a bundler — bundlers rewrite pdfkit's `import.meta.url` and break its embedded ICC/font resources) and runs 9 checks with the built-in `assert` module — no test framework introduced.
  - **Capability:** added `fs:allow-write-file` to `src-tauri/capabilities/default.json` (binary counterpart of the already-granted text write; same `$HOME/**` scope + dialog per-file grants). No Rust changes; validated by `tauri dev` startup, so `cargo check` was not run.
- **Architecture decision record (renderer selection):**

  | Candidate | License / status | Assessment |
  |---|---|---|
  | **@react-pdf/renderer 4.9.0** + **react-pdf 10.5.0** viewer (pdfjs-dist 5.4.296) | MIT (react-pdf); Apache-2.0 (pdfjs-dist); react-pdf maintained Aug 2026 | **SELECTED** |
  | pagedjs 0.4.3 | MIT; last publish Oct 2024 (stale) | Rejected: CSS-paged-media polyfill renders beautifully in-browser, but Tauri/WebView2 exposes no offline automated print-to-PDF API (`window.print()` is interactive; WebView2 PrintToPdf not plumbed through Tauri 2) → export would need a second engine → preview ≠ export divergence |
  | Vivliostyle (@vivliostyle/core) | **AGPL-3.0** (confirmed via npm) | Excluded: license-incompatible with distributing a closed desktop app |
  | pdfmake 0.3.11 | MIT; maintained Jun 2026 | Deferred: capable PDF-first engine but non-React JSON doc definitions; no capability gain over the selection for a React app |
  | react-pdf v11 | MIT | Rejected: requires React 19; app is on React 18.3 |

  **Selection rationale:** pure JS/WASM (fully offline after install), deterministic byte-stable output, **one artifact serves both preview and export** (fidelity by construction), React component model, real layout/pagination engine (Yoga) with `break`/`fixed`/`minPresenceAhead`, standard-14 fonts need no embedding (license-clean), headless Node API enables automated verification, and a PDF/A option exists for Phase 08 (lab documents). Transitive licenses: pdfkit MIT, yoga-wasm-web BSD/MIT, fontkit MIT, @react-pdf/* MIT, pdfjs-dist Apache-2.0 — all permissive; 0 vulnerabilities at install.
- **Renderer behavior findings (verified, not assumed):**
  - `break` is honored **only on direct children of `<Page>`** (behavior-matrix tested); blocks nested inside wrapper Views lose their page-break requests — the Phase 08 block renderer must therefore keep blocks as page children or hoist breaks.
  - An empty zero-height break View is dropped by the layout engine.
  - Tables have **no primitive** — composed from flex rows with `wrap={false}`; rows are unbreakable, so **row-level page splitting and repeated header rows across a split table are not automatic** (Phase 08 risk, documented below).
  - Unregistered font families throw a predictable `Font family not registered: …` error; the PoC maps the schema default "Segoe UI" to the PDF standard-14 Times family (no embedding).
  - Justified text with hyphenation works (`textAlign: justify` + `hyphenation` — observed "rec-/ommended" broken across a page boundary).
  - Fixed running header/footer via `fixed` + `pageNumber`/`totalPages` render props verified; PDF MediaBox writes as `[0 0 595.280029 841.890015]`; text streams are hex-encoded TJ arrays.
  - **pdf.js buffer detach (manual-test finding):** `getDocument({ data })` transfers the ArrayBuffer to its worker, detaching the original — first export wrote a 0-byte file. **StrictMode double-effect (manual-test finding):** dev mount effects run twice, so the second `getDocument` on the already-detached buffer failed with "An ArrayBuffer is detached and could not be cloned". **Fix:** the viewer loads from a `blob:` object URL created/revoked in an effect (the `Blob` constructor copies the bytes; state bytes stay authoritative for export), plus zero-length-export guards in `PocViewer` and `pdf-export-io.ts`. This pattern is required for Phase 08.
- **Preview/export comparison (manual, 3-way):** in-app PDF.js preview vs. committed artifact `fixtures/p02-m4/renderer-poc-output.pdf` vs. the app-exported file opened in an external viewer — page count (3), text wrapping (including mid-sentence hyphenation overflow on page 1), explicit page break (page 2 starts at the heading), table + caption, image scaling and margins, and fonts all consistent; byte counts and render time shown in the viewer status line. All 10 scripted scenarios passed after the two bug-fix cycles above.
- **Automated checks executed:**
  - `npm run build` — exit code 0, 259 modules, built in 5.92s (main chunk ~1.92 MB / 663 KB gzip + 1.04 MB pdf.js worker; code-splitting deferred — noted as a performance item).
  - `npm run verify:p02-m4` — **9 passed, 0 failed**: fixture completeness; genuine `%PDF-` file > 8 KB; exactly 3 physical pages; A4 MediaBox; extractable text (header/footer/table/caption); explicit page-break creates a real page boundary (page-3 footer sits between the last pre-break paragraph and the post-break heading); byte-identical deterministic re-render; font-fallback outcome documented; missing asset → clear error (`not found in document.assets`).
  - `npm run verify:p02-m2` — 11 passed, 0 failed; `npm run verify:p02-m3` — 12 passed, 0 failed (no regressions).
  - `npx tauri dev` — launched, capability validated; process shut down after manual testing.
- **Manual integration test evidence (real Windows, `npx tauri dev`, executed by the project owner):** 10 scripted scenarios — Renderer PoC toggle; Render Sample PDF (3 pages, byte count, render ms); page 1/2/3 visual inspection (mid-sentence overflow with hyphenation, page-break top alignment, table + image); export to `C:\Projects\DocStudio-Test\p02-m4-renderer-poc.pdf`; 3-way preview/artifact/external-viewer comparison; export cancel leaves no file; New/Save/Open regression; offline confirmation — **all passed** (owner: "working fine now"). Two real defects were found and fixed during this manual cycle (0-byte export from pdf.js buffer detach; StrictMode first-load failure) — evidence the manual gate caught what automation could not.
- **Offline behavior:** no network request at any point after install — PDF.js worker is bundled locally, fonts are engine standard-14, the image is embedded base64.
- **Not completed / known risks for Phase 08:**
  - PoC maps only heading/paragraph/page-break/table/image; other block types show `"[not yet mapped]"`.
  - No table row-splitting across pages; no repeated header row for split tables; no `colSpan`/`rowSpan`; no running-header content flow across page boundaries; no ten themes, cover page, watermark, footnotes, TOC/cross-references, page-numbering styles, or block editor.
  - Bundle size ~1.92 MB main chunk — acceptable for a desktop app but code-splitting should be evaluated in Phase 08/09.
  - PDF/A conformance, custom embeddable-font licensing, large-document (50+ page) performance, and print quality remain Phase 08 obligations.
- **Deviations from planned scope:** none (fixture PNG generated offline via PowerShell System.Drawing instead of adding an image dependency; no broad Tauri permission added — only the narrow `fs:allow-write-file`).
- **Commit/reference:** `opencode/p02-m4-renderer-poc` (implementation + verification + roadmap commit)
- **Next action:** Proceed to P02-GATE (Phase 02 exit-criteria review) upon user instruction.

---

### 2026-10-16 — [MAJOR] P02-GATE: Phase 02 Exit-Criteria Review

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (2026-10-16)
- **Review basis:** branch `opencode/p02-gate-phase02-review` created from pushed P02-M4 tip `986ce6f` (confirmed on `origin`); the audit inspected the current source — `src/types/document.ts`, `src/types/blocks.ts`, `src/types/defaults.ts`, `src/services/document-file.ts`, `src/services/document-io.ts`, `src/services/document-actions.ts`, `src/App.tsx`, `src/renderer/poc/*`, `src-tauri/capabilities/default.json` — and the committed artifact, not prior reports alone. `project_details.md` was read, not modified.
- **Exit-criteria evidence matrix:**

  | # | Phase 02 exit criterion | Result | Evidence (inspected/rerun at gate) |
  |---|---|---|---|
  | 1 | Document schema is versioned and documented | **PASS** | `DOCSTUDIO_SCHEMA_VERSION = 1` (`src/types/document.ts:29`) with migration policy documented (`document.ts:18`, `document-file.ts` header: equal opens / newer → `unsupported-version` / older → `no-migration`); `verify:p02-m2` test 8 rejects wrong versions; `npm run build` exit 0 |
  | 2 | Save/open/duplicate/new/clear work for the supported data | **PASS** | `verify:p02-m2` 11/11 (round-trip + invalid-file rejection), `verify:p02-m3` 12/12 (New/Duplicate/Clear/Reset tests 1–5), gate rerun green; manual owner runs recorded in P02-M2 ("no errors, working ok") and P02-M3 ("verified, working ok") entries |
  | 3 | Unsaved changes detected; destructive actions handled safely | **PASS** | `verify:p02-m3` tests 6–11 incl. async guard tests 9/10 (cancel aborts replacement; save failure/cancel blocks it; failed open preserves active document); `resolveUnsavedChanges` + `ConfirmDialog` in `App.tsx`; manual 10-scenario P02-M3 run |
  | 4 | Metadata stored in the document model, not only in UI state | **PASS** | `DocumentMetadata` (19 standard fields + `customFields`) lives inside `DocStudioDocument`; defaults factory `createDefaultMetadata`; survives save→open (m2 test 2); PDF Info dictionary built from `doc.metadata` (`poc-document.tsx:309–315`); no metadata state exists in React — the editing UI itself is the recorded scope residue below |
  | 5 | Early rendering proof of concept succeeds | **PASS** | `verify:p02-m4` 9/9; artifact `fixtures/p02-m4/renderer-poc-output.pdf` re-validated at gate: **13,854 bytes, `%PDF-1.3`, `%%EOF`, 3 × `/Type /Page`, `/MediaBox [0 0 595.280029 841.890015]` (A4)**; verify rerun regenerated it byte-identically (tree clean); recorded 3-way preview/artifact/external-viewer comparison (P02-M4); decision recorded (DEC-001) |
  | 6 | Checkpoint evidence is recorded | **PASS** | Checkpoint log entries P02-M1 → P02-M4 with actual commands, counts, manual results and limitations; this gate entry; summary/status/decision boards reconciled |
- **Audit-area findings (A–E of the review scope):**
  - **A. Versioned document model — PASS.** Identity (`DocUUID`), metadata, `EmbeddedLabProfile`, `PageSetup`/`TypographySettings`/`FrontPageSettings`/`HeaderFooterSettings`, `ContentBlock[]` (21-type discriminant, stable IDs), `AssetRecord` (base64), `schemaVersion` all present in the schema; pure default factories in `defaults.ts`; `serializeDocument` validates before writing and `deserializeDocument` never blind-casts — invalid/unsupported files rejected whole with typed `DocumentFileError`; format and version policy documented in `document-file.ts`.
  - **B. Native save/open and lifecycle — PASS.** `document-io.ts` uses only native dialogs + scoped `readTextFile`/`writeTextFile`; capability grants are narrow (`dialog:allow-open/save`, `fs:allow-read-text-file`, `fs:allow-write-text-file`, `fs:allow-write-file`, `fs:scope $HOME/**` — no unrestricted fs permission); `document-actions.ts` implements New/Duplicate/Clear/Reset with reference-aware asset pruning; `App.tsx` derives `dirty`/`sessionStatus` from a baseline fingerprint and guards replacements via Save/Discard/Cancel; cancel, I/O failure and invalid-open paths all preserve the active document (m2 test 9, m3 tests 9–11).
  - **C. Laboratory Profile foundation — PASS (foundation only).** `EmbeddedLabProfile` provides typed reusable fields (name, address, location, phone, email, website, `logoAssetId`, `documentIdPrefix`) snapshotted into each document at creation, plus `createDefaultLabProfile()`. Live-profile persistence/editing beyond the per-document snapshot is deliberately Phase 03 per roadmap §2.5 ("or set up as typed fields for a later phase"); **no missing Phase 02 prerequisite identified** — Phase 03 must add profile storage/UI itself.
  - **D. Rendering architecture critical gate — PASS.** Fixture (`poc-fixture.ts`) inspection confirms: 10 paragraphs with mid-sentence overflow, explicit `page-break`, 6×4 table with caption, embedded local PNG, A4/25 mm defaults; translation (`poc-document.tsx`) documents the Segoe UI → standard-14 Times fallback; same-bytes render service (`poc-render.ts`) feeds both the PDF.js preview and the export; artifacts and comparison results committed/recorded. **Scope limit:** the PoC maps only heading/paragraph/page-break/table/image — it does not validate every future block, theme, table-pagination case, font, or production document (Phase 08).
  - **E. Evidence traceability — conflicts found and resolved:**
    1. **Metadata-panel editing UI (§2.2) not implemented.** The entire component tree contains zero bound inputs; `LeftPanel.tsx` Document Information is a static placeholder whose subtext claimed "will be wired in Phase 02" — contradicting a closing Phase 02. This is a genuine scope residue, **not** an exit-criterion failure (criterion 4 is model-level and passes). Resolved documentation-only at this gate: placeholder text corrected to state the current truth; the gap itself is recorded here for an owner decision (smallest remediation: a dedicated small checkpoint to wire the base metadata fields, or an owner-approved `DEFERRED` destination — recommendation: alongside the Phase 05 editor). Not silently treated as complete.
    2. **`Save As` (§2.4) not implemented** — already documented as deferred in the P02-M3 entry (first save via dialog; re-save writes to the associated path). Exit criterion 2 lists save/open, which pass; recorded here for completeness.
    3. **No committed sample `.docstudio` fixture** — the format is documented and round-trip is exercised by `verify:p02-m2` test 1 plus the recorded manual save/open; minor, no criterion depends on a committed sample.
    4. **Date note:** the review was actually performed on **2026-10-16** (the instruction's `2026-10-15` verified date applies only if that is the actual review date); 2026-10-15 remains the date of the P02-M1 → P02-M4 checkpoints.
- **Final regression checks executed at gate (2026-10-16):**
  - `npm run build` — exit code **0** (259 modules, built in 8.05s; known 1.92 MB chunk-size warning).
  - `npm run verify:p02-m2` — **11 passed, 0 failed**, exit 0.
  - `npm run verify:p02-m3` — **12 passed, 0 failed**, exit 0.
  - `npm run verify:p02-m4` — **9 passed, 0 failed**, exit 0 (regenerated artifact byte-identical to the committed one; `git status` clean afterwards).
  - Artifact validation (PowerShell, no new tooling): 13,854 bytes, `%PDF-1.3` header, `%%EOF` trailer, 3 page objects, A4 MediaBox — genuine multi-page PDF.
  - `cargo check` — **not run**: this checkpoint changed no Rust source, Tauri plugin, or capability/configuration file (only `project_roadmap.md` plus one placeholder string in `LeftPanel.tsx`); the `fs:allow-write-file` capability was already validated at P02-M4 `tauri dev` startup.
  - Manual scenarios — **not repeated**: P02-M2/P02-M3/P02-M4 manual evidence is present, mutually consistent, and no regression or contradiction was found (per the review's evidence-reuse rule).
- **Gate decision:** all six exit criteria PASS with sufficient, freshly rerun evidence → **`P02-GATE` VERIFIED; Phase 02 VERIFIED (2026-10-16)**. Critical blockers: none. Known risks carried forward (R-001 mitigated not resolved; table page-splitting/themes/fonts/large-document performance → Phase 08; metadata-panel UI residue → owner decision; Save As deferred).
- **Files changed:** `project_roadmap.md` (summary rows, Phase 02 status/exit criteria/checkpoints, Phase Status Board, Minor Checkpoint Board, DEC-001, DEC-002, R-001, this entry); `src/components/left-panel/LeftPanel.tsx` (metadata placeholder subtext corrected).
- **Commit/reference:** `opencode/p02-gate-phase02-review` (this gate review commit)
- **Next action:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard; remains `NOT STARTED` and begins only on user instruction. Recommended before/with it: an owner decision on the recorded metadata-panel residue.

---

### 2026-10-16 — [MINOR] P02-M5: Document Metadata Panel Editing Foundation (post-gate follow-up)

- **Phase:** Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept
- **Status:** VERIFIED (automated verification + manual Windows integration test by the project owner)
- **Relationship to the gate:** this is the authorized post-gate follow-up that RESOLVES the metadata-panel scope residue recorded in the P02-GATE entry (§2.2 of the Phase 02 plan). The P02-GATE entry and its 2026-10-16 verified date are preserved unchanged as historical record; this checkpoint was verified on the same day after the gap was closed.
- **Scope completed:**
  - **New pure field module** `src/services/metadata-fields.ts` (no React/DOM/Tauri imports): declarative `METADATA_FIELD_SPECS` covering **every editable `DocumentMetadata` key exactly once** (19 text/textarea/date/select fields + the status select + `customFields` rows), group ordering, `STATUS_PRESETS` + `statusOptions()` (a custom status value is never silently replaced by a preset), `toDatePickerValue()` (`YYYY-MM-DD`, or the date part of a full ISO string), `normalizeFieldValue()` (empty OPTIONAL → `undefined` so type-then-clear restores a clean value; required fields keep a string; non-empty date values outside `YYYY-MM-DD` pass through unchanged — never silently dropped), and `formatTimestampForDisplay()`.
  - **New authoritative update action** `updateDocumentMetadata(source, patch, now)` in `src/services/document-actions.ts`: applies a partial patch to the ONE real `document.metadata` object; strips app-managed `createdAt`/`modifiedAt` from every patch (ordinary editing can never rewrite creation time); compares each provided key (arrays such as `customFields` structurally); **returns the SAME document reference when nothing differs** (no re-render, no false `Modified`, no timestamp churn) and stamps `modifiedAt = now` only on a real change (project_details.md §6 policy). Module-header policy note added.
  - **New controlled panel** `src/components/left-panel/DocumentInfoPanel.tsx`: accessible controlled inputs (`label`+`id` pairs, `role="group"` sections, `aria-label`s, `:focus-visible` outlines) grouped as Identification (Title, Subtitle, Organization/Laboratory Name, Document ID, Document Status select), Issue & Revision Control (Issue Number, Issue Date, Document Holder, Revision Label, Amendment Number, Effective Date, Review Date), Preparation & Approval (Prepared/Reviewed/Approved By), Classification (Document Type, Department/Section), Standards & References (Applicable Standard, Clause References, Supersedes), read-only Created/Modified displays, and an Additional Fields row editor (add/edit label+value/remove with stable UUIDs). Dark theme handled via `color-scheme` for native pickers.
  - **Wiring:** `App.tsx` gained `handleMetadataChange` (closure over the authoritative `activeDocument`; the only metadata state in the app); props threaded through `Workspace` → `LeftPanel` → `DocumentInfoPanel`. The Document Information placeholder (including the stale "will be wired in Phase 02" text and the illustrative hard-coded sample values) was REMOVED and replaced by the real panel; the honest no-document fallback remains if props are absent.
  - **`LeftPanel.css`:** theme-token-based styles for the new controls (no new dependency, no layout change to the three-column workspace).
  - **Verification script** `verify_p02_m5.mjs` (+ npm script `verify:p02-m5`): compiles the actual `metadata-fields.ts`, `document-actions.ts` and `document-file.ts` with tsc and runs 14 checks with the built-in `assert` module — no test framework introduced.
- **Timestamp and dirty-state policy (as implemented and documented):**
  - `createdAt` is immutable through editing; direct patch attempts are stripped (test 5).
  - `modifiedAt` advances on a real metadata change and on save; no-op patches do not touch it (tests 4, 6).
  - A no-op edit (same value re-typed, same status re-selected, identical custom-field array) returns the same document reference → status stays `Saved` (test 4, manual scenario 6).
  - Reverting a field to its original value after a real edit leaves the document `Modified` until saved, because `modifiedAt` genuinely changed — consistent with the content/settings policy.
  - The formal document `metadata.status` remains a metadata field, fully distinct from the topbar session status.
- **Schema:** unchanged. No `document.ts` edit was needed — the existing v1 schema already models every required/optional/extended field; the gap was purely UI.
- **Automated checks executed (2026-10-16):**
  - `npm run build` — exit code 0, 261 modules, built in 5.92s (main chunk 1.93 MB; known warning).
  - `npm run verify:p02-m5` — **14 passed, 0 failed**: field-spec coverage of every editable schema key (guard against silent omission — this test caught and fixed an incomplete fixture during development); each required field updates the authoritative document; single-field edit preserves all unrelated metadata; edits mark `Modified`; saved+unchanged not falsely `Modified` (incl. same-reference no-op assertions); `createdAt` stable across edits; `modifiedAt` policy; serialize/deserialize round-trip; **save→reopen restores every value the controlled inputs read** (`metadata[key] ?? ''` per spec); New/Open replace displayed metadata; duplicate/clear/reset + unsaved-guard outcomes; deterministic date/normalization/status-option rules; custom-field add/edit/remove incl. no-op removal.
  - Regression: `npm run verify:p02-m2` — 11/11; `verify:p02-m3` — 12/12; `verify:p02-m4` — 9/9 (all exit 0; artifact regenerated byte-identically).
  - `cargo check` — **not run**: no Rust source, Tauri plugin or capability/configuration change in this checkpoint (frontend TypeScript only; the fs/dialog capabilities were unchanged since P02-M4).
- **Manual integration test evidence (real Windows, `npx tauri dev`, executed by the project owner):** 11 scripted scenarios — initial real values in place of the old placeholder; edit → topbar `Modified`; field isolation across edits; Created immutable/Modified advancing; status select distinct from session status; **no false dirty** (same-value re-edit and same-status re-select stay `Saved`); save → reopen restores all values in the actual inputs (incl. optional/approval fields and Date Modified advance); date pickers set/clear cleanly; Additional Fields add/edit/remove; New/Duplicate/Clear/Reset value transitions; unsaved-changes Save/Discard/Cancel guard — **all passed** (owner: "working ok").
- **Not completed / limitations:**
  - Metadata editing exists only in the Left Panel; cover-page visible-field selection and preview binding remain Phase 04+ work.
  - `Save As` is still deferred (unchanged P02-M3 decision).
  - Fingerprint comparison remains plain `JSON.stringify` (key-order sensitive) — unchanged known limitation, safe within a session.
  - No committed sample `.docstudio` fixture; the manual test wrote `C:\Projects\DocStudio-Test\p02-m5-metadata.docstudio` (local-only).
- **Files created/modified:**
  - `src/services/metadata-fields.ts` — CREATED
  - `src/components/left-panel/DocumentInfoPanel.tsx` — CREATED
  - `verify_p02_m5.mjs` — CREATED
  - `src/services/document-actions.ts` — MODIFIED (`updateDocumentMetadata` + policy note)
  - `src/components/left-panel/LeftPanel.tsx` — MODIFIED (real panel replaces placeholder)
  - `src/components/left-panel/LeftPanel.css` — MODIFIED (control styles)
  - `src/components/workspace/Workspace.tsx` — MODIFIED (prop threading)
  - `src/App.tsx` — MODIFIED (handler + threading)
  - `package.json` — MODIFIED (`verify:p02-m5` script)
- **Commit/reference:** `34848d4` on `opencode/p02-m5-metadata-panel` (this checkpoint's commit)
- **Next action:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard; remains `NOT STARTED` and begins only on user instruction.

---

### 2026-10-16 — [MINOR] P03-M1: Versioned Template Data Model

- **Phase:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard
- **Status:** VERIFIED (automated verification; this is a data-model/serialization checkpoint with no UI surface, so no manual test applies)
- **Branch:** `opencode/p03-m1-template-schema`, created from the pushed P02-M5 tip `2aba4a6` (confirmed on `origin` before branching; working tree clean at branch point). `project_details.md` was read, not modified.
- **Scope completed:**
  - **Template format decision (recorded):** a `.dstemplate` file holds ONE pretty-printed UTF-8 JSON object whose root is a `DocStudioTemplate`. The `__type: 'DocStudioTemplate'` signature discriminator makes a `.docstudio` project (signature `'DocStudio'`) impossible to mistake for a template and vice versa (verify:p03-m1 test 11). The `.dstemplate` extension does not collide with `.docstudio` (native dialogs remain filtered to `.docstudio`). No native save/open dialogs or filesystem permissions were added — template file storage and library management are deferred to a later checkpoint.
  - **New `src/types/template.ts`:** `DocStudioTemplate` root with a dedicated `DOCSTUDIO_TEMPLATE_SCHEMA_VERSION = 1` that is INDEPENDENT of `DOCSTUDIO_SCHEMA_VERSION` (a template change never forces a document migration). Identity/catalog metadata: stable `TemplateId`, `TemplateOrigin` (`builtin` vs `user` with a reserved `builtin.` prefix enforced by `isBuiltinTemplateId` and validated so a user template cannot claim the prefix), name, description, category, tags, optional author. All 8 principal categories from project_details §11.1–§11.8 are modeled as a serializable `TemplateCategory` union + an ordered `TEMPLATE_CATEGORIES` list (id/label/description) — a single filterable source, not hardcoded into UI.
  - **Document defaults reuse, no parallel schema:** `TemplateDocumentDefaults` is PARTIAL throughout and reuses the real document settings types (`Omit<DocumentMetadata,'createdAt'|'modifiedAt'|'customFields'>` as `TemplateMetadataDefaults`, `EmbeddedLabProfile`, `PageSetup`, `PageTypographySettings`, `FrontPageSettings`, `HeaderFooterSettings`). Omitted values fall back to application document defaults at instantiation rather than leaking `undefined` into a document.
  - **Initial content structure:** ordered `TemplateSection[]` (stable id, name, optional description/prompt, `headingLevel`, ordered `ContentBlock[]` starters, optional reference/clause hints). Sections are template-level structure, NOT a new content-block type; the active `ContentBlock`/`DocStudioDocument` v1 schema is unchanged.
  - **Instantiation mapping contract (documented, not wired):** `sectionToBlocks()` / `templateSectionsToBlocks()` in `template-defaults.ts` encode the rule that a section flattens to `[heading built from name+headingLevel, ...section.blocks]`. Full document-initialization (deep-copying blocks, merging defaults, stamping timestamps) is deliberately P03-M2; the helper is pure and testable today.
  - **New `src/types/template-defaults.ts`:** pure factories — `createDefaultTemplate`, `createTemplateSection`, `createTemplateHeadingBlock`, `createTemplateParagraphBlock`, `createTemplateReferenceHint` — each returning fresh objects with fresh IDs and no shared mutable references (isolation proven by test 12).
  - **New `src/services/template-file.ts`:** pure (no React/DOM/Tauri) `serializeTemplate` (validates first, deterministic output), `deserializeTemplate` (never blind-casts), `validateTemplate` (structural checks for identity, origin/prefix policy, category membership, ordered sections/blocks, reference hints, optional asset envelopes reusing `AssetRecord`), typed `TemplateFileError` codes (`invalid-json`, `invalid-signature`, `unsupported-version`, `no-migration`, `invalid-structure`), and `defaultTemplateFileName()` (`.dstemplate`). Version policy: equal opens; newer → `unsupported-version`; the `no-migration` code exists and is documented for older versions but is unreachable while the current version is 1 (the `version < 1` guard fires first — asserted in test 10). No new validation dependency.
  - **New `src/services/template-samples.ts`:** one small, deterministic example SOP fixture (fixed IDs/timestamps, 2 sections, 1 reference hint, metadata/lab-profile/page-setup/front-page defaults) proving the schema is usable. Built-in origin uses the reserved `builtin.` prefix. It is generic scaffolding and does NOT imply ISO/IEC 17025 conformity.
  - **Asset contract (documented limitation):** a template MAY carry an optional `assets` bundle reusing `AssetRecord` for self-contained branding; cross-references (e.g. `labProfile.logoAssetId`) must resolve within the same template. To avoid duplicating large payloads, built-in templates (P03-M3) will prefer the user's own logo and keep `assets` empty by default; full asset packaging/deduplication belongs to a later checkpoint and was NOT redesigned here.
  - **New `verify_p03_m1.mjs` (+ npm script `verify:p03-m1`):** compiles the actual modules with tsc and runs 14 checks with the built-in `assert` module — no test framework introduced.
- **Automated checks executed (2026-10-16):**
  - `npm run build` — exit code 0, 261 modules, built in 6.00s (main chunk 1.93 MB; known code-splitting warning, unchanged).
  - `npm run verify:p03-m1` — **14 passed, 0 failed**: (1) valid default template created; (2) template/section/block/reference IDs stable and unique; (3) serialize→deserialize round-trip; (4) deterministic byte-identical serialization incl. round-trip; (5) all 8 categories representable and round-trip; (6) metadata defaults, settings, ordered sections and blocks survive round-trip; (7) custom tags, prompts and reference/clause fields survive round-trip; (8) malformed JSON rejected (`invalid-json`); (9) missing/invalid required fields rejected (`invalid-structure`); (10) unsupported newer version rejected (`unsupported-version`) and invalid versions rejected; (11) template↔document cross-rejection (template JSON rejected by `deserializeDocument`, document JSON rejected by `deserializeTemplate` with `invalid-signature`, distinct signatures, builtin-prefix policy); (12) mutating one template/fixture does not mutate another; (13) example template structurally valid + flattening contract; (14) document serialization/lifecycle unaffected.
  - Regression: `npm run verify:p02-m2` — 11/11; `verify:p02-m3` — 12/12; `verify:p02-m4` — 9/9; `verify:p02-m5` — 14/14 (all exit 0).
  - `cargo check` — **not run**: this checkpoint changed no Rust source, Tauri plugin, or capability/configuration file (pure frontend TypeScript + a Node verification script + `package.json` script entry + roadmap).
- **Not completed / limitations:**
  - Local reusable Laboratory Profile editing/persistence (§3.1) is NOT done — only the `EmbeddedLabProfile` snapshot type is reused by template defaults; live-profile storage/UI is separate pending Phase 03 work.
  - Template chooser, search/filter UI, and initializing a new document from a template (§3.4) are NOT done.
  - The initial category library of usable samples (§3.3) is NOT done — only one example fixture exists.
  - Section add/remove/rename/reorder customization UI (§3.4) is NOT done.
  - No native template save/open dialogs or filesystem permissions added (deferred; format is validated purely in memory).
  - Older-template `no-migration` path is unreachable while template schema version is 1 (guard ordering), though the code and policy are in place.
  - No committed `.dstemplate` sample file; the example lives as a factory function (deterministic).
- **Files created/modified:**
  - `src/types/template.ts` — CREATED
  - `src/types/template-defaults.ts` — CREATED
  - `src/services/template-file.ts` — CREATED
  - `src/services/template-samples.ts` — CREATED
  - `verify_p03_m1.mjs` — CREATED
  - `src/types/index.ts` — MODIFIED (exports the two new template type modules)
  - `package.json` — MODIFIED (`verify:p03-m1` script)
  - `project_roadmap.md` — MODIFIED (this entry + summary/status/boards/checkpoints)
- **Decisions recorded:**
  - Template schema versioning is SEPARATE from `DOCSTUDIO_SCHEMA_VERSION`; template changes never force a `.docstudio` migration.
  - File signature discriminator `__type: 'DocStudioTemplate'` + distinct `.dstemplate` extension guarantee cross-format rejection in both directions.
  - Built-in templates use an immutable, readable `builtin.<category>.<slug>` ID; user templates use UUIDs; the prefix is validated so origins cannot be spoofed.
  - Sections are template-level structure that flattens to the existing block sequence (no new block type; document schema unchanged).
  - Defaults are PARTIAL and reuse existing document settings types (no parallel metadata schema).
- **Commit/reference:** `52f904e` on `opencode/p03-m1-template-schema` (this checkpoint's commit); pushed fast-forward from `2aba4a6`.
- **Next action:** Proceed to P03-M2 (template chooser and document initialization) upon user instruction; Phase 03 is NOT complete.

---

### 2026-10-16 — [MAJOR] P03-M2: Template Chooser, Document Initialization, and Laboratory Profile Foundation

- **Phase:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard
- **Status:** VERIFIED (automated verification + live UI review on a real `npx tauri dev` build; the review was driven by the agent through the running renderer — the project owner did not participate in this run, so this is recorded as agent-performed manual-equivalent evidence, not owner sign-off)
- **Branch:** `opencode/p03-m2-template-chooser`, created from the pushed P03-M1 roadmap tip `39dfc07`. `project_details.md` was read, not modified. No Rust source, Tauri plugin, or capability file changed.
- **Scope completed:**
  - **Template chooser (§3.4 first half):** `services/template-chooser.ts` (pure) + `components/template-chooser/TemplateChooser.tsx` — Blank Document is a first-class choice (`BLANK_CHOICE_ID`) always listed first; catalog from `getBuiltinTemplates()` filtered through `validateTemplate` (invalid templates are dropped); free-text search over name/description/tags; category filter populated from the single source of truth `TEMPLATE_CATEGORIES` (all 8 ids, no hardcoded labels); empty state message when no template matches (Blank stays selectable); ordered section preview (name/description/prompt); accessible modal (`role="dialog"`, `aria-modal`, labelled, initial focus on search verified, Escape/backdrop/Cancel resolve `null`, `aria-pressed` choice buttons, double-click confirms). The App opens the chooser from New and performs NO other action on cancel.
  - **Document initialization (pure `services/template-instantiation.ts`):** `createBlankDocument(profile, now)` and `instantiateTemplate(template, profile, now)` with a documented precedence policy — (1) application defaults (`createDefaultDocument`) as base, (2) template `defaults` deep-merge (an omitted or `undefined` template key never clobbers a real value), (3) the saved Laboratory Profile's identity wins (laboratory name in both the embedded snapshot and `metadata.organizationName`, address/location/phone/email/website where present, `documentIdPrefix`). `metadata.organizationName` rule: saved profile name if non-empty → else declared template `metadata.organizationName` → else the effective profile snapshot name (e.g. the template default "Example Laboratory"); empty leaves the base untouched. The profile object is never mutated. App-managed instance fields: fresh `id`, stamped `createdAt`/`modifiedAt`, empty `customFields`/`savedRevisions`, `trackChangesEnabled: false`, `metadata.documentId` deliberately kept blank (no auto document codes). Sections flatten through the P03-M1 contract into `[heading, ...section.blocks]`.
  - **Deep-copy/remint and assets:** every instantiated block is re-enveloped with fresh `id`s and its `data` deep-cloned; the asset bundle is copied with fresh asset IDs and every reference (`frontPage.logoAssetId`, block `images[].assetId`) remapped to an asset that resolves in the new document — the source template keeps its original references (both asserted by verify:p03-m2 tests 9–12).
  - **Laboratory Profile foundation (§3.1):** `types/lab-profile.ts` (`LabProfile` application-local type, `createEmptyLabProfile`), `services/lab-profile.ts` (pure normalize/parse/serialize/validate incl. email and website rules with blank-is-optional policy), `services/lab-profile-store.ts` (load/save/clear with injectable storage and safe fallback), `LabProfilePanel.tsx` in the Left Panel (local draft, Save Profile / Cancel / Reset, inline email/website validation). The App loads the profile BEFORE creating the startup document, so a saved profile seeds every new document.
  - **Guarded replacement:** selection resolution is extracted into the pure `resolveChooserSelection(choice, profile, now, guard)` — `null` choice returns `null` WITHOUT calling the guard; guard `'abort'`, guard exception, or save failure all return `null` (never replace unsafely); only `'proceed'` runs `createBlankDocument`/`instantiateTemplate`. The App's handler only closes the chooser and performs the single document swap through the existing `resolveUnsavedChanges` guard. No second document-session state model was introduced.
- **Automated checks executed (2026-10-16):**
  - `npx tsc --noEmit` — 0 errors (after every implementation round).
  - `npm run build` — exit code 0, 274 modules, built in 10.21s (main chunk 1,953.92 kB; known code-splitting warning, unchanged).
  - `npm run verify:p03-m2` — **18 passed, 0 failed**: (1) chooser discovers Blank + example with centralized category label and section preview; (2) search by name/description/tag (tag path proven with a synthetic tag); (3) category filtering across all 8 ids + label lookup; (4) no-match keeps Blank + cancel returns null without invoking the guard; (5) blank creation valid/fresh with profile identity; (6) declared partial defaults applied, empty profile → "Example Laboratory", named profile wins on name/organizationName/prefix; (7) missing nested settings stay valid (deep-merge, `undefined` never clobbers, no defaults → full defaults); (8) block order heading/paragraph/heading/paragraph/paragraph with exact texts; (9) fresh document/block IDs, unique, no template-ID leak; (10) mutating instantiated blocks cannot mutate the source template; (11) mutating the document cannot mutate the saved profile; (12) asset copy with fresh ID, payload preserved, front-page + block refs remapped and resolving, template untouched; (13) document/template/profile serialization distinct with cross-rejection in both directions + profile version/signature rejection; (14) persistence across a simulated restart (fresh storage handle over shared bytes), corrupt/wrong-signature/wrong-version → fallback + message, missing → clean default, clear works, no-storage save fails cleanly, email/website validation rules; (15) profile change does not retroactively alter an existing document or template (byte-identical) while new documents pick up the change; (16) Save/Discard/Cancel semantics (not-dirty proceeds without prompting, discard proceeds without saving, save runs exactly once, cancel aborts); (17) cancelled save, failed save, guard exception and blank-choice guard all abort replacement; (18) P02/P03 regressions (document round-trip, duplicate `(Copy)` suffix, metadata no-op same-ref, dirty/status helpers, deterministic template round-trip).
  - Regression: `npm run verify:p02-m2` — 11/11; `verify:p02-m3` — 12/12; `verify:p02-m4` — 9/9; `verify:p02-m5` — 14/14; `verify:p03-m1` — 14/14 (all exit 0).
  - `cargo check` — **not run**: no Rust source, Tauri plugin, capability, or `src-tauri` configuration changed (the profile persists via `localStorage`, the same app-local store already used for the theme).
- **Live review evidence (2026-10-16, real `npx tauri dev` build, agent-driven):**
  - `npx tauri dev` — Vite ready in 524 ms, cargo `dev` profile Finished in 16.44 s, `target\debug\docstudio.exe` launched; renderer reviewed against the running dev server; shut down cleanly afterwards (port 5173 free). **Zero console errors at every step.**
  - Chooser: New → `role="dialog"` "New Document" with search + category `<select>` listing all 8 centralized category labels; Blank Document listed first; Example SOP entry shows category label, description, tags and the ordered section preview (Scope / Responsibilities with prompts). Initial focus lands on the search box (verified via `document.activeElement`).
  - Search `zzz-no-match` → "No templates match your search…" status shown while Blank Document remains; category "Management-System Documents" hides the example; "Laboratory SOPs and Work Instructions" shows it.
  - Guard sequencing: editing the Title flips the badge to `Modified`; opening the chooser and Cancel leaves `Modified` + the edited title intact (chooser never touches the session); New → Blank → Create while dirty raises the existing "Unsaved changes" Save/Discard/Cancel dialog — **Cancel** keeps `Modified` with the title preserved, **Discard** replaces the document (badge `New`, filename/title reset). Clean-session Create skips the prompt.
  - Instantiation in the real app: Create from the example template → filename `Standard Operating Procedure.docstudio`, Title `Standard Operating Procedure`, Organization `Example Laboratory`, Document Type `SOP`, Department `Laboratory`, Applicable Standard `ISO/IEC 17025:2017`, Document ID `''`.
  - Laboratory Profile: saving with `not-an-email` shows the inline error "Enter a valid email address, or leave it blank." and writes NOTHING to storage; a valid save writes `docstudio_lab_profile` = `{"__type":"DocStudioLabProfile","schemaVersion":1,...}`; the already-created document's Organization stays `Example Laboratory` (no retroactive change); after a page reload the panel re-populates from storage; a subsequent Create from the example template shows Organization `Manual Test Lab` (saved profile identity wins). Escape closes the chooser.
  - Note: `browser.screenshot` was unavailable (desktop window not visible to the capture service), so evidence is the textual accessibility snapshots quoted above rather than images.
- **Persistence format (recorded):** one `localStorage` key, `docstudio_lab_profile`, holding a versioned JSON object — `__type: 'DocStudioLabProfile'`, `schemaVersion: 1`, then the trimmed profile fields (empty optionals are dropped). Equal version opens; malformed/wrong-signature/wrong-version falls back to the clean empty profile and surfaces a load-error message to the UI (a corrupted profile never blocks startup). No migration exists yet (version 1 only), no import/export, and the key is app-local and offline like the theme store (`docstudio_ui_theme`).
- **Not completed / limitations:**
  - The initial 8-category library (§3.3) is NOT done — the chooser shows exactly one example template; category filtering is exercised by only that fixture until P03-M3.
  - Section add/remove/rename/reorder customization (§3.4 second half) is NOT done.
  - Template authoring/save/reopen (`.dstemplate` native dialogs, user-template storage) is NOT done; the catalog source remains in-memory built-ins.
  - **Logo limitation:** raw logo bytes are deliberately NOT persisted in the profile (corruption and size risk in `localStorage`); `LabProfile.logoAssetId` exists but is forward-compatible only — durable logo storage belongs to a later asset-service checkpoint (no fs binary-read capability exists today). No `capabilities/default.json` change.
  - Profile scope is identity + contact + document-ID prefix only (no per-template defaults or logo upload UI).
  - Front-page rendering/themes, the block editor, and DOCX remain later-phase work (unchanged).
  - Automation covers the pure services only; React rendering (chooser markup, profile form) has no automated render test — it was verified through the live review above instead. Fingerprint remains `JSON.stringify` (key-order sensitive) and the main chunk stays ~1.95 MB — both unchanged known limitations.
- **Files created/modified:**
  - `src/types/lab-profile.ts` — CREATED
  - `src/services/lab-profile.ts` — CREATED
  - `src/services/lab-profile-store.ts` — CREATED
  - `src/services/template-instantiation.ts` — CREATED
  - `src/services/template-chooser.ts` — CREATED
  - `src/components/template-chooser/TemplateChooser.tsx` + `TemplateChooser.css` — CREATED
  - `src/components/left-panel/LabProfilePanel.tsx` + `LabProfilePanel.css` — CREATED
  - `src/App.tsx` — MODIFIED (profile load-before-session, save handler, chooser wiring, guarded replacement)
  - `src/components/left-panel/LeftPanel.tsx` — MODIFIED (profile panel integrated)
  - `src/components/workspace/Workspace.tsx` — MODIFIED (prop threading)
  - `src/types/index.ts` — MODIFIED (exports + `SectionState.labProfile`)
  - `verify_p03_m2.mjs` — CREATED (18 checks, tsc-to-temp + Node `assert`, no framework)
  - `package.json` — MODIFIED (`verify:p03-m2` script)
  - `project_roadmap.md` — MODIFIED (this entry + summary/status/boards/checkpoints)
- **Decisions recorded:**
  - Precedence policy: app defaults → template defaults (deep, `undefined` never clobbers) → saved Lab Profile identity wins; the profile object is never mutated by instantiation.
  - `metadata.organizationName`: saved profile name (if non-empty) → declared template value → effective profile snapshot name; applied in both blank creation and template instantiation.
  - Persistence is `localStorage` with a single versioned key (same pattern as the theme) — deliberately avoiding a new Tauri capability and any Rust change.
  - Guard sequencing lives in the pure `resolveChooserSelection`; cancel/abort paths short-circuit before any document is constructed, and a throwing guard aborts rather than replacing unsafely.
  - `metadata.documentId` stays blank on creation (no automatic document codes); `LabProfile.logoAssetId` never flows into documents (no dangling references).
- **Commit/reference:** `1b361bf` on `opencode/p03-m2-template-chooser` (this checkpoint's implementation commit; the roadmap evidence is the following commit on the same branch). No force-push, no history rewrite, nothing merged to `main`.
- **Next action:** Proceed to P03-M3 (core laboratory template samples across the 8 categories) upon user instruction; Phase 03 is NOT complete (P03-M3, P03-M4 and P03-GATE remain).

---

### 2026-10-16 — [MAJOR] P03-M3: Core Laboratory and Administrative Template Library

- **Phase:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard
- **Status:** VERIFIED (automated verification + live UI review on a real `npx tauri dev` build; the review was driven by the agent through the running renderer — the project owner did not participate in this run, so this is recorded as agent-performed manual-equivalent evidence, not owner sign-off)
- **Branch:** `opencode/p03-m3-template-library`, created from the pushed P03-M2 tip `833c75c` (not from `main`). `project_details.md` was read (§11.1–§11.9), not modified. No Rust source, Tauri plugin, capability, or `src-tauri` configuration changed. No uncommitted user changes existed at branch time.
- **Scope completed:**
  - **Catalog architecture:** one authoritative built-in source, `src/services/template-library/index.ts` — an ordered list of 16 builder functions (retained P03-M1 `createExampleSopTemplate` + 15 new category builders, one module per category under `src/services/template-library/`). The canonical catalog is built LAZILY ONCE per process and never exported; every retrieval (`getBuiltinCatalogTemplates()` → chooser `getBuiltinTemplates()`) returns a deep JSON clone, so consumers cannot corrupt the source and repeated retrievals are byte-identical (stable section/reference/block identities across chooser opens). Each template is validated through `validateTemplate` at build time; an invalid built-in would be dropped and is caught by the expected-count assertions in `verify:p03-m3`. Root ids remain immutable `builtin.<category>.<slug>` slugs. No registry framework or plugin mechanism was introduced; `TemplateChooser.tsx` and `App.tsx` required no rewrite (`App` still calls `getBuiltinTemplates()` once per mount).
  - **Catalog contents (16 templates — exactly 2 per category across all 8 `TEMPLATE_CATEGORIES`):** management-system: **Quality Policy**, **Quality System Procedure** (both carry the editable suggested applicable-standard metadata + front page enabled); technical-procedures: **Testing / Calibration Procedure** (scope, equipment list, environmental-conditions table, numbered procedure steps incl. a warning step, QC checklist, calculations note, acceptance criteria, safety callout, records, references, approval), **Method Verification / Validation Protocol** (objectives → design → acceptance criteria → recorded data → analysis → deviations → conclusion → authorisation); sops-work-instructions: retained **Example Standard Operating Procedure** (identity byte-identical to the P03-M1 fixture, asserted) + **Equipment Operation Work Instruction** (safety, pre-start checklist, startup/operation/shutdown steps, troubleshooting table, maintenance prompts); worksheets-rough-datasheets: **Raw Observation Worksheet** (identification grid, open observation rows, manual-readings table with an explicit "DocStudio does not acquire data from instruments" prompt, deviations, sign-off), **Replicate Reading Worksheet** (conditions table, numbered replicate grid, repeats/outliers prompt); final-datasheets-technical-records: **Processed Test Results Record** (raw-data traceability note, processed-results table with empty result cells, generic mean-calculation placeholder explicitly marked for replacement, QC evaluation with `pending` results, review sign-off), **Measurement Uncertainty Summary** (source table with `e.g.` prompts, generic `u_c`/`U = k·u_c` formula steps, reporting statement, review); forms-registers-exhibits: **Sample Receipt Form** (receipt details, sample table, incoming-documentation checklist, discrepancy prompts, receipt decision referencing the user's own procedure, sign-off), **Equipment Maintenance Record** (identification, schedule table, dated work-log table, defect/follow-up prompts, sign-off); quality-assurance: **Internal Audit Checklist** (identification, scope/criteria + explicit scaffold disclaimer callout, evidence/question checklist with "use your own classification scheme" wording, findings summary, actions table with effectiveness-check column, conclusion), **Nonconforming Work and Corrective Action Form** (report details, factual description, containment checklist, root-cause prompts (techniques offered as options, not requirements), cause-linked action plan, effectiveness review, closure approval); financial-administrative: **Quotation** (details, customer, scope, 6-column priced-item table, totals note with no tax logic, commercial-terms prompts with "DocStudio does not provide legal or tax advice", authorisation) and **Purchase Request** (details, justification, 7-column estimated-items table, budget notes with approval-route callout, authorisation) — both documented in their descriptions as general-purpose business documents, not ISO/IEC 17025 records.
  - **Content-quality policy applied throughout:** unique stable root ids; distinct names/descriptions (≥ 40 chars); ≥ 3 searchable tags each; ordered sections (5–12 per library template, 2 retained for the example SOP) with descriptions and author prompts; bracketed `[placeholder]` fields wherever laboratory-, method- or jurisdiction-specific values are required; no fabricated measurements, invented limits, universal clause claims or guaranteed-conformity wording; no laboratory identity hardcoded — library templates declare NO `defaults.labProfile` and NO `defaults.metadata.organizationName` (asserted), so identity always comes from the saved Laboratory Profile.
  - **Schema use:** only existing schema types and block discriminants; 10 new small type-safe factories added to `src/types/template-defaults.ts` (table with header/short-row padding, list incl. checklist state, callout, signature with 1–3-signer guard, equipment-list, procedure-steps, observation, measurement, acceptance-criteria, calculation) alongside the existing heading/paragraph factories. `DOCSTUDIO_TEMPLATE_SCHEMA_VERSION` and `DOCSTUDIO_SCHEMA_VERSION` unchanged; template validation, `.dstemplate` rules, and the P03-M1 section-flattening contract unchanged.
  - **Defaults and precedence:** partial `defaults.metadata` per template (title + documentType + department where meaningful; applicable-standard only for management-system docs; financial docs carry no department); page/front-page defaults only where they add value (front page on the two management-system docs). The P03-M2 precedence policy is untouched: app defaults → template deep-merge → saved profile identity wins; `metadata.documentId` is never preassigned (asserted live and in tests).
  - **Chooser integration:** `getBuiltinTemplates()` in `services/template-chooser.ts` now delegates to the catalog (documented); search/category filtering, section previews, Blank-first behavior and guarded selection all flow through the unchanged P03-M2 logic.
- **Automated checks executed (2026-10-16):**
  - `npx tsc --noEmit` — 0 errors (run after the library, the factory additions, and the harness fixes).
  - `npm run build` — exit code 0, 284 modules, built in 7.74s (the run immediately after implementation completed in 6.28s; the figures above are the final verification run; main chunk >500 kB warning unchanged, same known ~1.95 MB main chunk).
  - `npm run verify:p03-m3` — **18 passed, 0 failed**: (1) ≥ 16 distinct templates with distinct ids/names; (2) all 8 categories ≥ 2 templates each, no unregistered categories; (3) example SOP retained byte-identical to the P03-M1 fixture (id/name/sections/defaults/tags); (4) every catalog template passes `validateTemplate` (no drops); (5) `.dstemplate` serialize→deserialize deep-equal + byte-stable for all 16; (6) root ids unique, `builtin.<category>.<slug>` form, id list + full JSON byte-stable across repeated retrieval; (7) no id collisions anywhere inside any template (recursive `id` collection) nor across the catalog; (8) canonical catalog survives hostile consumer mutation (splice/rename/empty-sections/delete-description/tag-injection all fail to leak; byte-identical snapshot restored; fresh array per call); (9) names/descriptions/categories/tags/authors/section guidance populated, section names distinct within template, ≥ 5 sections/≥ 5 starter blocks for the 15 library templates; (10) all 16 instantiate into `validateDocument`-valid documents with declared title defaults applied; (11) fresh document ids per instantiation, template ids never leak, timestamps stamped from supplied `now`, block ids unique/disjoint/unique-per-instantiation, `savedRevisions`/`trackChangesEnabled`/`documentId` at initial state; (12) flattened block count = sections + starter blocks for all 16, headings in section order, every declared metadata default applied, ≥ 12 block data types survive into documents incl. specific deep checks (audit tables, quotation 6-column item table with header + 3 rows, empty worksheet observation rows, both uncertainty formula steps); (13) saved profile wins on name/organizationName/prefix across 5 representative templates, and with an empty profile NO library template produces a laboratory name (falsifiable no-hardcoded-identity check) while the example keeps `Example Laboratory`; (14) deep document mutation (metadata/identity/heading/span/table-cell/block injection) never alters the source template for all 16; (15) every template findable by name (any case) and first tag end-to-end, category filters contain only their category, no false matches; (16) Blank first-class (always listed first, no template, empty sections, survives zero-match filtering, creates a valid empty document through `resolveChooserSelection`); (17) anti-boilerplate — all 16 section-name signatures distinct, within-category pairs distinct, 60+ distinct section names (actual: 91), distinct opening paragraph texts, distinct descriptions; (18) in-script P02/P03 smoke (document round-trip/lifecycle/dirty helpers, deterministic template round-trip, profile serialize/version) — full regression evidence is the sibling suite below.
  - Regression: `npm run verify:p02-m2` — 11/11; `verify:p02-m3` — 12/12; `verify:p02-m4` — 9/9 (+ PDF artifact); `verify:p02-m5` — 14/14; `verify:p03-m1` — 14/14; `verify:p03-m2` — **18/18 after a documented fixture adaptation** (all exit 0).
  - **`verify:p03-m2` fixture adaptation (documented, contracts unweakened):** six places assumed "the catalog IS the single example" (the `exampleChoice` helper plus tests 1, 2, 3, 6 and 8: length `1`, choices index `[1]`, list-position `[0]`, sops-filter count `1`). They now locate the retained example by its stable id (`EXAMPLE_SOP_ID`), and test 3 additionally asserts every category-filtered entry actually belongs to that category. No P03-M2 contract (blank first-class, search/filter, precedence, guarded selection, isolation, serialization distinctness) was weakened; the change is noted in the script header and enforced by the new P03-M3 suite.
  - `cargo check` — **not run**: no Rust source, Tauri plugin, capability, or `src-tauri` configuration changed (the catalog is pure TypeScript; `cargo run` during the live review compiled/linked the unchanged `dev` profile incrementally in 1.35 s).
- **Live review evidence (2026-10-16, real `npx tauri dev` build, agent-driven):**
  - `npx tauri dev` — Vite ready in 525 ms, cargo `dev` profile Finished in 1.35 s (incremental, unchanged Rust), `target\debug\docstudio.exe` launched (window title "DocStudio"); renderer reviewed against the live dev server; shut down cleanly afterwards (exe gone, port 5173 free). **Zero console errors at every step** (`browser.console` level=error → 0 messages at the end of the full session).
  - Chooser: New → dialog shows **17 choices = Blank Document first + all 16 templates**, each with the correct category label (all 8 labels present, exactly 2 templates each), description, tags and ordered section previews (preview counts live: QP 6, QSP 8, Testing 12, VV 9, Example 2, Equipment WI 11, Raw 5, Replicate 5, Processed 7, Uncertainty 5, Receipt 6, Maintenance 5, Audit 6, NC/CA 8, Quotation 6, Purchase 5); initial focus on the search box.
  - Category filter (driven through the real `<select>`): all 8 categories each showed Blank + exactly their 2 templates; "All categories" restored 17.
  - Search: `uncertainty` → Blank + Measurement Uncertainty Summary; `quotation` → Blank + Quotation; `sop` → Blank + Example SOP; `zzz-nothing-matches` → the empty-state message with Blank still selectable; clearing restored 17.
  - Instantiation cycles (each through select → Create, settings panel read back): **Quality Policy** → Title `Quality Policy`, Type `Quality Policy`, Dept `Quality Management`, Applicable Standard `ISO/IEC 17025:2017`, Document ID `""`, Status `Draft`, Created/Modified stamped at creation time; **Quotation** → Title `Quotation`, Type `Quotation`, Dept `""` and Applicable Standard `""` (no leakage from the previous document), org still the profile value; **Raw Observation Worksheet** → Title/Type `Worksheet`/Dept `Laboratory`; **Example SOP** → Title `Standard Operating Procedure`, Type `SOP`, Applicable Standard `ISO/IEC 17025:2017`, **Organization `Manual Test Lab` (the saved profile beats the template's `Example Laboratory` default)**; **Blank Document** → `Untitled Document` with all template defaults absent and the profile org applied — Blank unaffected by the library.
  - Session integrity: Escape closes the chooser with the current document intact; Cancel closes it the same way; the session badge read `New` after each creation.
  - Note: `browser.screenshot` was unavailable (desktop window not visible to the capture service), so evidence is textual accessibility snapshots and DOM readbacks quoted above rather than images. The editor and preview panes remain the static Phase-05/Phase-08 PoC placeholders, so instantiated BLOCK content was verified by the automated suite (tests 10–12) rather than block-level UI; the settings-panel metadata values above are the live manual evidence.
- **Not completed / limitations:**
  - Section add/remove/rename/reorder customization (§3.4 second half) is NOT done → P03-M4.
  - Template authoring/save/reopen (`.dstemplate` native dialogs, user-template storage) is NOT done; the catalog remains in-memory built-ins.
  - **Rich block rendering/editing limitation:** templates use schema-valid list, callout, signature, procedure-step, equipment-list, observation, measurement, acceptance-criteria and calculation blocks as structural starting points. The block editor arrives in Phase 05 and those block types are not yet rendered by the P02-M4 renderer (which maps heading/paragraph/page-break/table/image only) — their presence proves schema validity and instantiation survival ONLY, not an editor or renderer feature.
  - Catalog breadth is a first usable set (16), not exhaustive versus every example listed in §11.1–§11.8 (e.g. Quality Manual, invoice, training form, proficiency-testing record remain future content additions).
  - The example SOP intentionally stays the minimal 2-section P03-M1 fixture (its identity and bytes are contract-tested); it is not representative of library-template richness.
  - Unchanged known limitations: no automated React render test (UI covered by the live review), `JSON.stringify` fingerprint (key-order sensitive), ~1.95 MB main chunk, profile logo bytes not persisted (P03-M2).
- **Files created/modified:**
  - `src/services/template-library/index.ts` — CREATED (canonical catalog: builders list, lazy build, validate-on-build, freeze, deep-clone accessor)
  - `src/services/template-library/shared.ts` — CREATED (fixed build timestamp + author constants)
  - `src/services/template-library/management-system.ts` — CREATED (Quality Policy, Quality System Procedure)
  - `src/services/template-library/technical-procedures.ts` — CREATED (Testing/Calibration Procedure, Method Verification/Validation Protocol)
  - `src/services/template-library/sops-work-instructions.ts` — CREATED (Equipment Operation Work Instruction)
  - `src/services/template-library/worksheets-rough-datasheets.ts` — CREATED (Raw Observation Worksheet, Replicate Reading Worksheet)
  - `src/services/template-library/final-datasheets-technical-records.ts` — CREATED (Processed Test Results Record, Measurement Uncertainty Summary)
  - `src/services/template-library/forms-registers-exhibits.ts` — CREATED (Sample Receipt Form, Equipment Maintenance Record)
  - `src/services/template-library/quality-assurance.ts` — CREATED (Internal Audit Checklist, Nonconforming Work and Corrective Action Form)
  - `src/services/template-library/financial-administrative.ts` — CREATED (Quotation, Purchase Request)
  - `src/types/template-defaults.ts` — MODIFIED (10 new block factories; existing factories untouched)
  - `src/services/template-chooser.ts` — MODIFIED (`getBuiltinTemplates()` delegates to the catalog; docs updated)
  - `verify_p03_m3.mjs` — CREATED (18 checks, same tsc-to-temp + Node `assert` harness pattern; FAIL lines print stack frames)
  - `verify_p03_m2.mjs` — MODIFIED (documented fixture adaptation: id-based example lookups instead of list positions)
  - `package.json` — MODIFIED (`verify:p03-m3` script)
  - `project_roadmap.md` — MODIFIED (this entry + summary rows, Phase 03 status/checkpoints/pending, Phase Status Board, Minor Checkpoint Board incl. the retroactive P03-M2 row)
- **Decisions recorded:**
  - One authoritative catalog: builders list + lazy per-process canonical build + deep-clone on every retrieval (stable identities across chooser opens; no consumer can mutate the source); validation at build time with the expected-count assertions catching any drop.
  - Builders are plain functions in per-category modules — no registry framework; the example SOP stays in `template-samples.ts` and leads its category in display order (category order = `TEMPLATE_CATEGORIES`).
  - Block factories live with the existing heading/paragraph factories in `types/template-defaults.ts` (single factory home, Node-pure, reusable by tests).
  - Library content uses fixed timestamps (`BUILTIN_TEMPLATE_TIMESTAMP`) and prompt/bracket placeholders; templates carry NO laboratory identity (`labProfile`/`organizationName` defaults forbidden by test 13).
  - `verify:p03-m2` catalog-position assertions were migrated to stable-id lookups rather than pinning the P03-M2 harness to a single-template catalog forever.
- **Commit/reference:** `a263578` on `opencode/p03-m3-template-library` (this checkpoint's implementation commit; the roadmap evidence is the following commit on the same branch). No force-push, no history rewrite, nothing merged to `main`.
- **Next action:** Proceed to P03-M4 (template section customization) upon user instruction; Phase 03 is NOT complete (P03-M4 and P03-GATE remain).

---

### 2026-10-16 — [MAJOR] P03-M4: Template Section Customization

- **Phase:** Phase 03 — Laboratory Profiles, Template Library, and Template Wizard
- **Status:** VERIFIED (automated verification + live UI review on a real `npx tauri dev` build; the review was driven by the agent through the running renderer — the project owner did not participate in this run, so this is recorded as agent-performed manual-equivalent evidence, not owner sign-off)
- **Branch:** `opencode/p03-m4-template-customization`, created from the pushed P03-M3 tip `703d371` (not from `main`). `project_details.md` was read (§11 line "Users must be able to add, delete, rename, reorder, and customize sections" and exit-criterion 7), not modified. No Rust source, Tauri plugin, capability, or `src-tauri` configuration changed. No uncommitted user changes existed at branch time.
- **Scope completed:**
  - **Pure customization service (`src/services/template-customization.ts`, React/DOM/Tauri-free):** section operations over an independent template DRAFT — `addSection` (fresh UUID via the existing `createTemplateSection` factory, non-empty default name "New Section", heading level 2, no starter blocks), `renameSection` (only `name` changes; id/blocks/references/heading level/description/prompt/position preserved), `removeSection`, `moveSection` (adjacent swap, content preserved), `updateSectionDescription` / `updateSectionPrompt` (verbatim storage; blank clears the key), plus a service-level `setSectionHeadingLevel` (1–4). Every operation DEEP-COPYES ON WRITE (JSON clone — exactly the `.dstemplate` serialization semantics) so the input is never mutated; on failure the input object is returned untouched with a deterministic code and human-readable message. Deterministic failure rules: `empty-name` (empty/whitespace-only names — the shared validator requires a non-empty section name because it becomes the generated heading), `missing-section` (non-string/empty id or zero matches), `duplicate-section-id` (ambiguous — never guessed), `invalid-heading-level`, `invalid-field` (non-string description/prompt, invalid move direction), `out-of-range` (move beyond first/last). All edits are addressed BY SECTION ID, never by array index. Draft-map helpers shared with the UI: `draftFor` (per-template-id map with fallback to the source — safe because operations copy before editing) and `withDraftResult` (failed operations store nothing); `createTemplateDraft` (deep-clone draft start), `isTemplateDraftModified` (JSON comparison), `findDraftIssues` (structural lint for duplicate ids/empty names/invalid heading levels).
  - **Chooser UI (existing `TemplateChooser.tsx` adapted, no second chooser, `App.tsx` untouched):** a clearly discoverable "Customize sections" panel appears whenever a template (never Blank Document) is selected, with `aria-expanded`/`aria-controls`, a live section count, and a "Reset to original" button shown only when the draft is modified. The display list resolves drafts BEFORE filtering (`drafts[id] ?? source`), so search, category filtering, the in-choice section preview and the confirmed `choice.template` all operate on the same editable working copy — the confirmed choice carries the DRAFT, and `resolveChooserSelection`/`instantiateTemplate` run through the unchanged P03-M2 precedence flow. Section rows (keyed by section id so reordering preserves input state) provide: name input with inline empty-name rejection (local text state so an invalid empty value never reaches the draft; real blur reverts an uncommitted empty edit), editable and cleanly clearable Description and Author prompt inputs, accessible Move ▲ / Move ▼ / Remove buttons whose aria-labels include the section name, and correct disabled boundary states (first Move Up / last Move Down disabled). Add appends a new section and focuses+selects its name input for immediate renaming; Remove focuses the following section's Remove button (or the previous row's, or Add when the list is empty); Move focuses the moved row (`tabIndex={-1}` container); Reset remounts rows via a key token and focuses Add. A panel-level `role="alert"` surfaces any failed-operation message. Escape/backdrop/Cancel/initial-focus/empty-search behavior unchanged. Template name, category, tags and template id remain READ-ONLY (per the P03-M4 scope); drafts keep the source id/origin/timestamps and `updatedAt` is deliberately not bumped.
  - **Isolation guarantees (live + automated):** editing a draft never touches the canonical catalog (deep clone in, deep copy out), another template's draft (per-id map), or any previously created document (instantiation already deep-copies/remints); creating a document does not mutate the draft; re-opening the chooser starts every draft from canonical content (drafts live for the chooser session only); removing the last section yields a schema-valid `sections: []` template that stays distinct from Blank Document via its id/name/defaults (document starts with no starter blocks but keeps the template's metadata defaults).
- **Automated checks executed (2026-10-16):**
  - `npx tsc --noEmit` — 0 errors (run after implementation and after the verify-script fixes).
  - `npm run build` — exit code 0, built in 5.36s (main chunk 2,020.86 kB / gzip 689.64 kB — the pre-existing >500 kB warning unchanged; the chunk grew from ~1.95 MB with the customization code).
  - `npm run verify:p03-m4` — **22 passed, 0 failed**, one check per checklist item: (1) draft is a different object graph from the canonical template and starts deep-equal; (2) the Example SOP and representative templates (Quality Policy, Quotation) stay BYTE-IDENTICAL after heavy edit sessions on their drafts, and the example still equals the P03-M1 fixture; (3) add appends one valid section with a fresh non-colliding UUID, name/heading level 2/blocks `[]`, options honored; (4) rename reproduces `{...original, name}` byte-for-byte (key order included) and preserves id/blocks/level/description with all other sections untouched; (5) every failure code — empty/whitespace names, missing/empty/nonexistent ids, non-string description/prompt, invalid move direction, heading levels 0/7/2.5, and duplicate section ids (operations reject ambiguous drafts; lint reports exactly the duplicate) — returns the input untouched; (6) remove drops exactly one section, others byte-identical in original order; (7) removing the last sections yields a valid `sections: []` template (`validateTemplate` + lint pass, instantiates into a `validateDocument`-valid blockless document with the template's title default — NOT `Untitled Document`), the chooser choice keeps the template id (never the blank sentinel), and the empty draft round-trips byte-stable through `.dstemplate`; (8) multi-step up/down moves produce the exact expected permutations and a move round-trip restores the original order with per-id content preserved; (9) out-of-range moves (first up, last down, both directions on a single-section draft) fail `out-of-range` with understandable messages and no change; (10) description/prompt set verbatim (only that field differs), blank/whitespace clears by removing the KEY, blocks/references/heading level/name/id intact; (11) after a full edit session every top-level field except `sections` is byte-identical (tags/category/name/id/origin/defaults/assets/`createdAt`/`updatedAt` explicitly re-asserted) and the source object itself was never written to; (12) customized drafts pass the shared `validateTemplate` and `.dstemplate` serialize→deserialize is deep-equal and byte-stable (including the zero-section draft and a renamed+re-leveled example draft); (13) a document instantiated from a renamed/removed/added/reordered draft has headings in exactly the customized order with the customized names, the removed section absent, the original starter block text preserved, and the flattening contract intact (heading-per-section with no blocks for the added empty section); (14) fresh document ids per instantiation, no template-level id leaks, block ids unique/disjoint from template block ids/unique per instantiation, timestamps from the supplied `now`, `savedRevisions: []`, `documentId: ""`; (15) deep document mutation (metadata, organization, lab profile, heading text, span text, injected block) leaves the draft and the canonical catalog byte-identical and a NEW document from the same draft still shows the draft content; (16) re-requesting the catalog after edits returns the byte-identical session-start snapshot (example = P03-M1 fixture, Quality Policy original names) and a discarded draft map falls back to the canonical source; (17) the draft-map flow: fallback identity before any edit, edits stored per id, each template's draft carries only its own edits, failed operations leave the map reference unchanged, sources byte-identical; (18) Blank Document is unaffected (no template, no sections, blockless `Untitled Document`, still offered first with an empty catalog); (19) search/category filtering over the draft-resolved display list still finds templates by their canonical (read-only) name/tag, the display entry for an edited template IS its draft, and unedited entries stay reference-identical to the sources; (20) saved-profile precedence through the customized-draft path (profile identity wins, `documentId` never preassigned, template defaults kept) and empty-profile behavior unchanged (library drafts invent no identity; the example keeps `Example Laboratory`); (21) session safety — Cancel (null choice) never runs the guard, guard abort / failed save / guard exception all abort, proceed creates from the CUSTOMIZED draft, blank follows the same guarded path, guard invoked exactly for real choices; (22) in-script P02/P03 smoke (document round-trip/lifecycle/dirty, deterministic example-template round-trip, lab-profile serialize, catalog byte-stability + count) with the sibling suites as the full regression evidence.
  - Regression (all exit 0): `verify:p02-m2` 11/11; `verify:p02-m3` 12/12; `verify:p02-m4` 9/9; `verify:p02-m5` 14/14; `verify:p03-m1` 14/14; `verify:p03-m2` 18/18; `verify:p03-m3` 18/18. No existing harness required any adaptation for P03-M4.
  - `cargo check` — **not run**: no Rust source, Tauri plugin, capability, or `src-tauri` configuration changed (the customization service and panel are pure TypeScript/CSS; `cargo run` during the live review compiled/linked the unchanged `dev` profile incrementally in 13.13 s, confirming the Rust side was untouched).
- **Live review evidence (2026-10-16, real `npx tauri dev` build, agent-driven):**
  - `npx tauri dev` — Vite ready in 458 ms, cargo `dev` profile Finished in 13.13 s (incremental, unchanged Rust), `target\debug\docstudio.exe` launched; renderer reviewed against the live dev server via a browser tab; shut down cleanly afterwards (processes terminated, port 5173 free). **Zero console errors and zero warnings for the entire session** (`browser.console` → 0 messages at the end).
  - Chooser baseline: New → dialog with **17 choices (Blank Document first and selected) + 16 templates**; no section controls while Blank is selected (panel absent); initial focus on the search box; dialog labelled.
  - Quality Policy selected → "Customize sections" panel appears (`aria-expanded=false`, correct `aria-controls`, count "6 sections", no Reset while unmodified). Expanding → 6 rows with correct disabled boundary states (first ▲ and last ▼ disabled), accessible button names (`Move "Policy Statement" up`, `Remove "Policy Statement"`), description/prompt inputs populated, ordered-sections aria-label, hint text.
  - Add section → 7th row appended with "New Section", name input focused with its text selected, count and the choice's live section preview updated, Reset appears; typing the rename updated both the row and the preview immediately.
  - Empty-name guard: clearing the field raised the inline `role="alert"` error "Section name cannot be empty." with `aria-invalid=true` while the draft/preview kept the old name; a real blur reverted the input and cleared the error.
  - Rename of the first section, two Move-up steps and a middle-section Remove all updated the row order and the live preview in lockstep; after the move the moved row held focus, and after the remove focus landed on the next section's Remove button. (Two same-tick evaluate clicks coalesced into one effective move because React had not re-rendered between them — a harness sequencing artifact, re-issued as separate ticks; not an app defect.)
  - Description set → preview note appeared; cleared → the note disappeared while the prompt note stayed; no error raised.
  - Cross-template switching: selecting Quotation showed its own 6 canonical sections in the editor (no Quality Policy edits leaked) while switching back to Quality Policy restored its in-progress edited draft exactly, with Reset visible again.
  - Cancel with the customized draft in place → chooser closed and the active document was untouched (title "Untitled Document", file `Untitled-1.docstudio`); re-opening the chooser showed Quality Policy's ORIGINAL 6 sections (drafts discarded with the chooser session).
  - Create from the customized draft (first section renamed to "Our Quality Policy", one "New Section" added — 7-section preview) → new document with file name `Quality Policy.docstudio`, Title `Quality Policy`, **Organization / Laboratory Name `Manual Test Lab` (the saved Laboratory Profile still wins through the customization path)**, Document ID `""`, Status `Draft`, Document Type `Quality Policy`, Department `Quality Management`, Applicable Standard `ISO/IEC 17025:2017`.
  - A SECOND document from the same built-in template (fresh chooser, no customization) showed the canonical 6-section preview and produced fresh, independent metadata — no cross-document or cross-session leakage.
  - Session safety: editing the title set the "Modified" badge; New → Quotation → Create raised the "Unsaved changes" Save/Discard/Cancel dialog; cancelling it aborted the replacement and the document survived with the user's edited title. Escape (with the editor open) closed the chooser the same way.
  - Reset to original (after a rename) restored the canonical 6 sections, hid the Reset button, and moved focus to Add section.
  - Note: instantiated document BLOCK content (heading order/names from the draft) was verified by automated test 13 — the editor and preview panes remain the static Phase-05/Phase-08 PoC placeholders, so the live evidence covers chooser/preview/metadata behavior, as at P03-M3. `browser.screenshot` was unavailable again, so evidence is DOM readbacks and accessibility data quoted above.
- **Not completed / limitations:**
  - **Custom templates are NOT persisted.** Drafts live for the chooser session only: closing the chooser or restarting the app discards them, and the "Reset to original" button deliberately discards a template's draft within a session. `.dstemplate` native Save/Open dialogs and user-template storage were explicitly out of scope for P03-M4 and remain a P03-GATE decision — customized templates must not be claimed to survive an app restart.
  - Heading-level editing exists at the SERVICE level only (deterministic 1–4 validation, tested); the P03-M4 UI does not surface it (scope discipline).
  - Individual starter blocks inside sections are not editable (only whole-section operations); the block editor arrives in Phase 05. Rich block types remain schema-valid structure that is not yet rendered/edited (carried from P03-M3).
  - Reset is all-or-nothing per template (no per-edit undo within the draft); redo after reset is not offered.
  - Duplicate section NAMES are allowed by design (uniqueness is enforced on ids, not display names).
  - Unchanged known limitations: no automated React render test (UI covered by the live review), `JSON.stringify` fingerprint (key-order sensitive), profile logo bytes not persisted (P03-M2), ~2.02 MB main chunk (grew with this checkpoint's UI code).
- **Files created/modified:**
  - `src/services/template-customization.ts` — CREATED (pure draft engine: deep-copy-on-write operations, deterministic error codes, draft-map helpers, lint)
  - `src/components/template-chooser/TemplateChooser.tsx` — MODIFIED (draft state, "Customize sections" panel + SectionRow, focus management; existing search/filter/Escape/Cancel behavior untouched)
  - `src/components/template-chooser/TemplateChooser.css` — MODIFIED (customization panel styles; dialog now scrolls (`overflow-y: auto`) so the expanded editor cannot clip the actions)
  - `verify_p03_m4.mjs` — CREATED (22 checks, same tsc-to-temp + Node `assert` harness pattern; FAIL lines print stack frames)
  - `package.json` — MODIFIED (`verify:p03-m4` script)
  - `project_roadmap.md` — MODIFIED (this entry + summary rows, Phase 03 checkpoints/pending, Phase Status Board, Minor Checkpoint Board)
- **Decisions recorded:**
  - A draft is an ordinary `DocStudioTemplate` deep-cloned with JSON semantics; every operation copies before editing and failure returns the input untouched — this makes source isolation structural rather than conventional, and keeps drafts byte-compatible with `.dstemplate` validation by construction.
  - Drafts are stored per template id for the chooser session (returning to a template preserves its in-progress draft); the session ends when the chooser closes, so a new session always starts from canonical content. "Reset to original" gives the user an explicit in-session restart.
  - The draft is resolved into the display list BEFORE search/category filtering, so the confirmed `choice.template` IS the draft and the entire P03-M2 instantiation/precedence/guard flow is reused without change (`App.tsx` untouched).
  - Empty section names are rejected rather than coerced (they would produce empty headings and fail the shared validator); the name input keeps local text so an invalid empty value never reaches the draft.
  - Removing the LAST section is allowed: `sections: []` is schema-valid (no minimum), the template stays distinct from Blank Document, and the resulting document simply starts without starter blocks (documented and tested).
  - Ambiguous drafts (duplicate section ids) are rejected deterministically instead of guessing a target; edits are always addressed by id.
  - `updatedAt` is not bumped by draft edits (a draft is not a persisted file), keeping unrelated-metadata assertions clean.
  - Template name/category/tags/id stay read-only in P03-M4; a draft never masquerades as a renamed built-in.
- **Commit/reference:** `28783b1` on `opencode/p03-m4-template-customization` (this checkpoint's implementation commit; the roadmap evidence is the following commit on the same branch — its hash is necessarily absent from this row because a commit cannot contain its own hash, a limitation explicitly noted here to keep the summary row honest). No force-push, no history rewrite, nothing merged to `main`.
- **Next action:** Proceed to P03-GATE (Phase 03 exit-criteria audit, including the template save/reopen decision) upon user instruction; Phase 03 is NOT complete.

---

## 9. Final Release Sign-Off

Do not complete this section until Phase 10 has been verified.

- [ ] Product requirements reviewed against `project_details.md`.
- [ ] All mandatory v1.0 features are implemented or explicitly deferred with owner approval.
- [ ] No known critical defects remain.
- [ ] Frontend production build passes.
- [ ] Tauri 2 production build passes.
- [ ] Core save/open/reopen/preview/export workflow tested in the packaged app.
- [ ] Preview/export fidelity regression set reviewed.
- [ ] Track Changes and saved revision history behavior tested.
- [ ] Ten cover themes and ten body themes verified as structurally distinct.
- [ ] Core functions verified offline.
- [ ] Installation/distribution type clearly documented.
- [ ] Known limitations and release notes published.
- [ ] Release commit/tag and distributable location recorded.

| Sign-off item | Result/date | Evidence/reference |
|---|---|---|
| Final build | Pending | — |
| Windows smoke test | Pending | — |
| PDF regression review | Pending | — |
| Release package | Pending | — |
| Version 1.0 sign-off | Pending | — |

**End of roadmap. Update this file as the project progresses.**
