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
| Current phase | Phase 02 — Document Model, Metadata, Local Lifecycle, and Renderer Proof of Concept |
| Overall status | **Phase 02 In Progress (P02-M1, P02-M1-R1, P02-M2, P02-M2-R1 Verified)** |
| Last checkpoint | `P02-M2-R1` (Filesystem scope verification — VERIFIED, no config change needed) |
| Current blocking issue | None |
| Last verified build | `npm run build` (tsc & vite: 52 modules, built in 1.09s, exit code 0) |
| Last verified test run | `verify_p02_m2.mjs` (11/11 passed); manual 7-scenario scope test in `npx tauri dev` (all passed) |
| Latest project commit | `opencode/p02-m2-native-save-open` `ff66587`; P02-M2-R1 branch commit pending push |

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

**Initial status:** `IN PROGRESS` — P02-M1, P02-M1-R1, P02-M2, P02-M2-R1 VERIFIED

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

- [ ] Document schema is versioned and documented.
- [ ] Save/open/duplicate/new/clear work for the supported data.
- [ ] Unsaved changes are detected and destructive actions handled safely.
- [ ] Metadata is stored in the document model, not only in UI state.
- [ ] Early rendering proof of concept succeeds or has a documented blocker and explicit resolution decision.
- [ ] Checkpoint evidence is recorded.

## Checkpoints

- `P02-M1`: Schema and defaults documented (`VERIFIED`).
- `P02-M1-R1`: Schema review corrections (`VERIFIED`).
- `P02-M2`: Native project save/open round-trip verified (`VERIFIED`).
- `P02-M2-R1`: Filesystem scope verification for paths outside `$HOME` (`VERIFIED`).
- `P02-M3`: Document lifecycle actions verified.
- `P02-M4`: Multi-page PDF/rendering proof of concept verified.
- `P02-GATE`: Phase 02 exit criteria met.

---

# Phase 03 — Laboratory Profiles, Template Library, and Template Wizard

**Initial status:** `NOT STARTED`

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

- `P03-M1`: Template schema completed.
- `P03-M2`: Template chooser and document initialization work.
- `P03-M3`: Core laboratory template samples created.
- `P03-M4`: Template customization verified.
- `P03-GATE`: Phase 03 exit criteria met.

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
| 02 | Document Model, Metadata, Lifecycle, Renderer Proof | IN PROGRESS | 2026-10-15 | — | P02-M1 `dc69b35`; P02-M1-R1 `89bbf3a`; P02-M2 `ff66587`; P02-M2-R1 (branch `opencode/p02-m2-filesystem-scope-check`) | Schema, save/open and fs-scope verified; P02-M3..M4 pending |
| 03 | Laboratory Profiles, Templates, Wizard | NOT STARTED | — | — | — | — |
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

## 6. Decision Log

Record decisions that influence architecture, dependencies, supported behavior, or release scope. For each decision, record the context, options considered, decision, rationale, date, and impact.

| Decision ID | Date | Topic | Decision | Rationale/evidence | Impact |
|---|---|---|---|---|---|
| DEC-001 | Pending | PDF preview/export architecture | Decide during Phase 02 after a working proof of concept | Preview/export fidelity is a major technical risk | Blocks final rendering implementation until resolved |
| DEC-002 | Pending | Native `.docstudio` file packaging | Choose and document during Phase 02 | Must preserve schema, content, assets, and future revision history | Affects persistence and compatibility |
| DEC-003 | Pending | DOCX import/export scope | Evaluate during Phase 08; PDF/native project reliability take priority | DOCX fidelity and maintenance cost must be evidence-based | May be included or explicitly deferred for v1.0 |
| DEC-004 | Pending | Windows distribution form | Confirm installer vs portable executable before Phase 10 | These are different distribution models | Affects packaging and release instructions |

## 7. Blocker and Risk Register

Keep this list current. Add an owner/decision needed when useful.

| ID | Risk/blocker | Impact | Mitigation/evidence required | Status |
|---|---|---|---|---|
| R-001 | Preview and exported PDF may differ in page breaks, fonts, or element positions | Critical | Prove a multi-page renderer in Phase 02; validate against actual PDFs in Phase 08 | OPEN |
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
