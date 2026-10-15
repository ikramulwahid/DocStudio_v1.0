# DocStudio — Project Details and Permanent Project Specification

> **Purpose of this file:** This is the stable source of truth for DocStudio's identity, purpose, scope, functional requirements, technology choices, UI structure, and product boundaries. Treat it as the project's permanent baseline. Do not silently rewrite, shorten, reinterpret, or replace this file while implementing features. Change it only when the project owner explicitly asks to change the specification. Implementation progress, dates, checkpoint results, and changing task status belong in `project_roadmap.md`, not here.

---

## 1. Project Identity

| Property | Specification |
|---|---|
| Application name | **DocStudio** |
| Application version target | **1.0** |
| Developer name | **Ikram ul Wahid** |
| Application type | Standalone Windows desktop application |
| Distribution target | Windows executable/installer built with **Tauri 2** |
| Frontend framework | **React** |
| Language | **TypeScript** |
| Frontend build tool | **Vite** |
| Backend/service requirement | No remote backend, hosted service, or account system |
| Login requirement | None |
| Network requirement | Core application features must work offline |
| Main output | Professional documents and exported PDF files |
| Native editable project format | Versioned `.docstudio` project file (format to be designed and documented) |

## 2. Product Purpose

DocStudio is a standalone document-authoring and formatting application primarily intended to help laboratories create professional documents related to ISO/IEC 17025 and their laboratory operations. It is also intended to support general laboratory administrative and financial documents.

The application combines:

1. A structured, modular document editor.
2. Reusable laboratory and administrative document templates.
3. Professional page layout, typography, and cover-page design.
4. A live, paginated PDF preview that faithfully represents the exported PDF.
5. Local document saving, reopening, duplication, and recovery.
6. Optional change tracking and saved revision history for the document's content.

The product should help users create documents, not manage the laboratory's entire quality system.

## 3. Explicit Product Boundaries and Non-Goals

DocStudio is **not** a LIMS, QMS, ERP, document-control server, or laboratory information-management platform.

Do not introduce the following as core product requirements:

- User accounts, login, roles, or a permission-management system.
- Cloud services, a remote database, synchronization, or a mandatory internet connection.
- A document approval-routing workflow.
- Controlled-copy distribution or a document-distribution system.
- A mandatory organization-wide master document register.
- An accreditation management system or a claim that software use guarantees ISO/IEC 17025 conformity.
- Instrument connectivity, sample tracking, result management, or other LIMS functionality.
- Tamper-proof audit-trail claims. Local change history is a convenience and documentation aid, not a secured audit system.

The editor may include document fields such as `Prepared by`, `Reviewed by`, `Approved by`, `Document status`, `Effective date`, `Revision`, and `Supersedes`. These are document metadata/content fields, not an approval or document-control workflow. The active-file status in the topbar (`New`, `Saved`, `Modified`, etc.) is separate from the user-visible status metadata inside the document.

## 4. Core Product Principles

1. **Standalone and offline-first:** Core editing, local save/open, templates, preview, and PDF export must not rely on a remote service.
2. **Document-centric:** A document's content, metadata, page setup, theme settings, and embedded assets are represented in a clear, versioned data model.
3. **Structured but flexible:** Templates should provide a useful starting structure without preventing users from adding, deleting, renaming, or rearranging sections and blocks.
4. **Preview/export fidelity:** Preview and exported PDF must use the same authoritative layout and rendering strategy, with documented limitations where exact fidelity is not technically achievable.
5. **Reusable components:** Blocks, templates, theme tokens, metadata fields, and renderer components should be reusable rather than implemented as unrelated one-off features.
6. **Preserve user work:** Destructive actions require confirmation where appropriate. Saving, reopening, clearing, changing themes, and reverting revisions must not silently lose content.
7. **Distinct visual designs:** Design themes must differ in composition and typographic structure, not simply in color or shade.
8. **No false capability claims:** Buttons and features must not imply success before the operation actually succeeds. Document history must not be described as tamper-proof.

## 5. Main Application Interface

The main window must have a topbar and three primary columns. The intended proportions of the available workspace are approximately:

- Left column: **25%**
- Middle column: **35%**
- Right column: **40%**

These are target proportions. Gaps, borders, scrollbars, and minimum widths must be handled so the interface remains usable. Implement independent scrolling for long panels. If practical, add resizable column dividers while retaining sensible minimum widths.

### 5.1 Topbar

**Left side:**

- DocStudio logo/icon.
- Application name.
- Visual separator.
- Active document/session status, for example `New`, `Saved`, or `Modified`.
- Active document name.

**Right side:**

- New.
- Save (and Save As where appropriate).
- Open.
- Export.
- Clear Document.

Requirements:

- Buttons need clear labels or accessible tooltips, coherent icons, focus/hover/disabled states, and real behavior.
- If a feature is not implemented yet, it must not display a fake success message.
- Warn before discarding unsaved changes when a destructive or document-switching action would lose them.
- The active-document status is application/session state and must not be confused with the document's editable metadata field named `Document status`.

### 5.2 Interface Appearance Modes

Provide three switchable application-interface modes:

- **Multicolor**
- **Light**
- **Dark**

These modes affect the DocStudio interface only. They must not unintentionally change the saved document's design theme or PDF appearance. Store the user's interface preference separately from document formatting.

### 5.3 Left Column — Document Settings

Use collapsible, logically grouped sections. The column includes:

1. Document Information.
2. Front Page.
3. Page & Typography.
4. Header & Footer.
5. Document Statistics.
6. Document Actions.

Each panel should preserve user-entered values when collapsed or reopened. Use suitable field validation and sensible defaults.

### 5.4 Middle Column — Document Editor

This is the structured content-editing area. Users create a document by adding and editing modular blocks. Blocks must have stable identities and retain their settings through reorder, save, reopen, duplicate, and revision operations.

### 5.5 Right Column — Live PDF Preview

The right column contains a preview toolbar and a live paginated preview. It must display page-shaped output using the selected physical page size, orientation, margins, fonts, spacing, block positions, headers, footers, and pagination.

Preview controls:

- Current page and total pages (`Page X of Y`).
- Toggle layout margin guides on/off.
- Fit Width (default mode).
- Fit Page.
- Zoom in and zoom out.
- Current zoom level, if practical.
- Navigate between pages.

The preview must update when relevant document content or formatting changes. It must not be merely a scaled view of the editor's unconstrained content area.

## 6. Document Information and Metadata

The Document Information panel must support these fields:

### Required fields in the panel

- Title.
- Subtitle.
- Organization/laboratory name.
- Document ID/code.
- Document status.
- Date created.
- Date modified.

### Optional fields

- Issue number.
- Issue date.
- Document holder.

### Additional recommended metadata fields

The schema should be extensible enough to support:

- Document type/category.
- Revision/version label.
- Amendment number.
- Effective date.
- Review date (optional informational field, not a workflow).
- Prepared by.
- Reviewed by.
- Approved by.
- Department/section.
- Applicable standard, method, or reference.
- Relevant clause reference(s).
- Supersedes/replaces reference.
- Custom user-defined metadata fields.

Not every field must be mandatory for every document type. Templates may set useful defaults. The user must be able to choose which supported metadata fields appear on the cover page, in a header/footer, or inside a metadata block.

Date created should remain stable after creation. Date modified should update under a clearly defined policy when the document content or settings change or the file is saved. Date formatting should be locale-aware where feasible without changing the underlying stored date/time representation.

### Laboratory Profile

Support a reusable local Laboratory Profile for commonly reused details, such as:

- Laboratory/organization name.
- Address and contact details, where desired.
- Logo.
- Default document ID prefix or formatting convention, if configured.
- Preferred fonts and document defaults.

The profile is a convenience for document authoring; it is not an organization account, central repository, or document-control system.

## 7. Front-Page Designer

The front page can be enabled or disabled. When enabled, the display-header option described under Page & Typography must be disabled as specified, while retaining its stored setting so the user does not lose their preference.

### 7.1 Front-Page Controls

- Toggle front page on/off.
- Select visible metadata fields from available document metadata.
- Configure title, subtitle, and laboratory-name placement.
- Optional additional text or synopsis below the subtitle.
- Logo selector.
- Logo size adjustment.
- Background-image selector.
- Page frame/border controls.

### 7.2 Frame and Border Controls

Where appropriate, support:

- Show/hide frame.
- Border style.
- Thickness.
- Color.
- Corner radius.
- Inset distance/margin from the page edge.
- Related spacing/alignment controls.

The layout must account for page size, orientation, content length, logo/image dimensions, and monochrome presentation.

### 7.3 Ten Distinct Front-Page Themes

Build ten selectable, structurally distinct cover themes. Suggested design directions:

1. **Classic Formal:** centered title, traditional typography, restrained rules or ornament.
2. **Minimalist:** generous whitespace, a restrained typographic hierarchy, minimal decoration.
3. **Corporate Band:** strong horizontal color/neutral bands and clearly separated information zones.
4. **Technical Grid:** precise alignment, metadata grid, document code and technical structure.
5. **Editorial Split:** asymmetrical or split-column title and information layout.
6. **Photographic Hero:** large background/hero image with deliberate title and contrast treatment.
7. **Institutional Frame:** structured border/frame, logo placement, formal metadata alignment.
8. **Geometric:** blocks, shapes, lines, and deliberate geometric composition.
9. **Scientific Publication:** journal-like hierarchy, compact metadata, abstract/synopsis region.
10. **Administrative Record:** information-dense but ordered layout suited to controlled-looking forms and procedural documents.

These names define design directions, not a license to implement ten color variants of one layout. The final implementation must give each theme its own layout rules, hierarchy, spacing, alignment, and decorative structure.

### 7.4 Monochrome

Every front-page theme must have a monochrome option. It must convert or adapt colors, borders, backgrounds, and decorative elements while preserving the theme's layout and readable contrast.

## 8. Page Setup, Typography, and Body Themes

### 8.1 Page Setup

Support at minimum:

- A4, A3, A5, Letter, and Legal page sizes.
- Portrait and landscape orientation.
- Normal, narrow, wide, and custom margins.
- Custom top, bottom, left, and right margins.
- Custom spacing and relevant print-layout options supported by the rendering architecture.

### 8.2 Typography

Support:

- Font family selection.
- Base font size.
- Line spacing.
- Consistent paragraph spacing.
- Consistent heading hierarchy.
- Font fallbacks and clear behavior if a font is unavailable.
- Appropriate font handling/embedding in the exported PDF when technically and legally supported.

Heading sizes must be derived from centralized typography tokens based on the base font size. Changing the base font size should update dependent heading sizes consistently, except where a specific block explicitly supports an intentional override.

### 8.3 Ten Distinct Page/Typography Themes

Provide ten body-page themes with genuinely different typographic and compositional rules. Suggested directions:

1. **Classic Formal:** serif-led hierarchy, traditional spacing and restrained rules.
2. **Minimalist:** clean sans-serif typography, whitespace and quiet section boundaries.
3. **Editorial:** expressive heading scale, deliberate alignment and clear reading rhythm.
4. **Scientific Journal:** compact but legible hierarchy, dense technical content and formal captions.
5. **Technical Specification:** numbered sections, precise labels, structured rules and tables.
6. **Corporate:** strong heading levels, consistent branding accents and tidy page furniture.
7. **Geometric:** geometric section markers, modular layout and graphic rules.
8. **Framed Document:** visible page/section framing and formal page treatment.
9. **Contemporary Asymmetrical:** selective asymmetry and differentiated information zones while maintaining readability.
10. **Traditional Serif:** book-like serif text, formal hierarchy and classic document spacing.

These body themes are separate from the ten cover themes. Each requires a monochrome mode that preserves its composition and keeps text and essential elements readable.

### 8.4 Display Header Option

Provide a display-header toggle as required. Disable this control while the front page is on, but preserve its setting for when the front page is turned off.

## 9. Header and Footer Designer

Provide an on/off switch and a grid-based editor for header and footer content.

Requirements:

- Configurable number of rows and columns.
- Default layout: one row and two columns.
- Editable cell content.
- Suitable horizontal/vertical alignment controls.
- Optional page numbering with these exact modes:
  - `Page X of Y`
  - `X/Y`
  - `X` (number only)
  - `None` (disabled)
- Optional custom watermark.
- Watermark text, position, rotation, opacity and other practical layout controls where supported.
- Defined behavior for the first page and subsequent pages.
- Correct interaction with the front-page option and page numbering.

The settings UI should let users configure the grid without typing markup. Header/footer content and watermarks must be part of the final document rendering, not UI-only overlays.

## 10. Document Editor and Block System

The editor is modular. Users can insert, select, edit, duplicate, reorder, configure, and delete blocks. Each block has a stable ID and configurable space above and below it. Block configuration must be represented in the saved document model.

### 10.1 Heading Block

- H1, H2, H3, and H4.
- Numbered or plain mode.
- Font hierarchy follows Page & Typography settings.
- Consistent styling and numbering in editor, preview, and export.

### 10.2 Paragraph/Rich-Text Block

Support:

- Bold.
- Italic.
- Underline.
- Strikethrough.
- Hyperlinks.
- Left, center, right, and justified alignment.
- Indentation.
- Text highlight with selectable colors.
- Font color.
- Normal text editing and appropriate paste behavior.

Inline style information must be stored as document data rather than being dependent only on transient browser/editor state.

### 10.3 Callout Block

Support semantic variants such as:

- Information.
- Warning.
- Success.
- Note.
- Other reasonable custom variants if practical.

Each type must have a recognizable design and remain understandable in monochrome and PDF output.

### 10.4 List Block

Support bulleted lists with choices including:

- Solid bullet.
- Hollow bullet.
- Circle.
- Square.
- Dash.
- Arrowhead.
- Other practical predefined styles.

Support numbered lists including:

- Decimal.
- Upper/lower Roman numerals.
- Upper/lower alphabetic sequences.

Allow sensible nesting/continuation behavior where feasible. List markers must print correctly.

### 10.5 Table Block

- Default table: 2 rows × 2 columns.
- Add/delete rows.
- Add/delete columns.
- Editable cell contents.
- Optional highlighted header row.
- Header-row treatments: light, medium, and heavy.
- Stable column sizing and alignment behavior.
- Predictable table behavior when a table crosses a page boundary.

### 10.6 Formula Block

- LaTeX formula input/rendering.
- Formula font size tied to the typography base size.
- Left, center, or right alignment.
- Optional display mode.
- Optional formula number.
- Variable definitions.
- Default `Where:` label for variable definitions.
- Place variable definitions to the right of the formula when space permits; move them below when the available width is insufficient.
- Preserve formula and variable-definition data in the native project file.

The renderer must handle formula overflow and PDF output predictably. The implementation should use a suitable maintained formula-rendering library selected during implementation.

### 10.7 Image Block

- Load images from local files.
- Crop and resize.
- Set size and aspect-ratio behavior.
- Add caption.
- Caption position: top or bottom.
- Support one image or two images side by side.
- Configure image/caption alignment where practical.
- Preserve assets in or alongside the native project file so reopened documents do not depend on fragile original paths.

### 10.8 Signature Block

- One, two, or three signers per block.
- Left, center, or right overall alignment.
- Signer name or designation is required for each signer.
- Department and date are optional.
- Suitable signature line/space presentation.
- Clearly distinguish a printed name/designation from an actual electronic signature. Do not imply that a text name or image is a verified digital signature.

### 10.9 Other Blocks

Include:

- Horizontal line.
- Page break.
- Section break.
- Document metadata block.
- Revision-history block/table.
- Procedure-step block.
- Equipment/materials list or table.
- Sample/technical observation block.
- Measurement/worksheet table.
- Calculation block.
- Acceptance-criteria block.
- Reference/citation block.
- Exhibit/annexure block.

The laboratory-specific block types should remain configurable and reusable; they must not turn DocStudio into a sample tracking or results management system.

## 11. Laboratory Document Templates

Provide an organized template library and a new-document template chooser. Templates are starting structures and remain editable. Users must be able to add, delete, rename, reorder, and customize sections and save custom templates for reuse.

### 11.1 Management-System Documents

Examples:

- Quality Manual.
- Quality Policy.
- Quality System Procedures.
- Document format or procedure templates.
- Exhibits and annexures.
- Management-system supporting documents.

### 11.2 Technical Procedures and Methods

Examples:

- Technical procedures.
- Testing procedures.
- Calibration procedures.
- Sampling procedures.
- Laboratory-developed methods.
- Method verification/validation protocols.
- Measurement uncertainty procedures/calculations.
- Calculation methods and worked examples.

### 11.3 Laboratory SOPs and Work Instructions

Examples:

- Instrument/equipment operation.
- Instrument startup/shutdown.
- Maintenance and cleaning.
- Sample preparation.
- Reagent/standard preparation.
- Environmental monitoring instructions.
- Other laboratory work instructions.

### 11.4 Worksheets and Rough Datasheets

Examples:

- Blank observation sheets.
- Raw-data/rough datasheets.
- Instrument-reading logs.
- Sample-preparation worksheets.
- Replicate-reading tables.
- Handwritten-record layouts.

Templates should provide suitable spaces for manual recording when printed, without requiring DocStudio to acquire data from instruments.

### 11.5 Final Datasheets and Technical Records

Examples:

- Processed results tables.
- Calculation sheets.
- Quality-control result sheets.
- Measurement uncertainty summaries.
- Result-review worksheets.
- Report-preparation sheets.

### 11.6 Forms, Registers, Exhibits, and Annexures

Examples:

- Training and competency forms.
- Equipment/maintenance forms.
- Sample receipt forms.
- Checklists.
- Supporting exhibits.
- Reference tables and annexures.

These are documents/templates only; DocStudio is not responsible for operating the underlying laboratory process.

### 11.7 Quality-Assurance Document Templates

Examples:

- Internal-audit checklists.
- Management-review agendas and minutes.
- Proficiency-testing/interlaboratory-comparison plans and records.
- Nonconforming-work forms.
- Complaint records.
- Corrective-action forms.
- Risk/issue assessment forms.

### 11.8 Financial and Administrative Documents

Examples:

- Quotations.
- Invoices.
- Purchase requests.
- Expense sheets.
- Budgets.
- Cost calculations.
- Service records.
- Commercial/administrative correspondence.

These are general-purpose document templates and are not represented as mandatory ISO/IEC 17025 documents.

### 11.9 Template Behavior

Templates should be tagged and searchable by type/category. A template may define:

- Suggested metadata defaults.
- Initial cover theme and page theme.
- Initial page size, margins, and typography.
- Starter sections and headings.
- Suggested blocks and tables.
- Optional prompts/instructions for the author.
- Suggested reference/clause fields.

Template content must not claim that using it guarantees compliance or accreditation. Users are responsible for choosing and adapting templates for their laboratory's activities and applicable requirements.

## 12. Change Tracking and Revision History

Change tracking is a document-authoring aid and is an important DocStudio feature. It does not create a secure or tamper-proof audit trail.

Provide three related but distinct capabilities.

### 12.1 Track Changes While Editing

- On/off toggle.
- Visually mark inserted and deleted text/content.
- Record formatting changes where technically feasible.
- Identify affected block/section.
- Record local date/time and a locally configured editor name if provided.
- Accept/reject individual changes where supported.
- Accept/reject all changes where supported.
- Preserve tracking data on save and reopen.
- Clearly distinguish tracked changes from the final document appearance; users can control whether markup appears in the exported PDF.

No login or account system is required. A configured author name is user-supplied metadata, not authenticated identity.

### 12.2 Saved Revision History and Comparison

- Save named or numbered document snapshots.
- Store version label, saved date/time, optional summary and optional reason for change.
- Compare two saved snapshots.
- Identify inserted, deleted, or modified text and changed blocks where technically feasible.
- Support restoring an earlier snapshot as a new current state without silently erasing the previous snapshots.
- Display history in a dedicated panel or section/page.
- Store history locally with the project, subject to a documented file-size strategy.

### 12.3 Revision-History Page/Table

Allow the user to insert a formal revision-history section into the document, with configurable fields such as:

- Revision/version.
- Date.
- Affected section/page.
- Description of changes.
- Reason for revision.
- Prepared/reviewed/approved by, if applicable.

Entries may be suggested from saved revision metadata but must remain editable. The user can choose placement and whether the revision table is included in the final exported document.

### 12.4 Distinguish Revision History from Undo/Redo

Undo/redo supports short-term editing operations. Saved revision history preserves selected document states across save/reopen. Track Changes marks edits. The formal revision-history page is printed document content. These functions are related but not interchangeable.

## 13. Document Statistics and Actions

### 13.1 Statistics

Display live statistics, including:

- Word count.
- Character count (define whether spaces are included and use that convention consistently).
- Number of blocks.
- Number of pages from the pagination/rendering system.
- Optional counts by block type, such as headings, tables, images, formulas, and signatures.
- Optional per-page word count if it can be calculated accurately enough to be useful.

Page count must be derived from actual layout/pagination, not estimated solely from word or character count.

### 13.2 Document Actions

- New document.
- Save and Save As.
- Open project file.
- Duplicate document.
- Clear document contents.
- Reset settings to defaults.
- Export PDF.
- Restore a saved revision.
- Manage local autosave/recovery where implemented.

Clearing content and resetting settings are different actions. Their scope must be stated clearly, and confirmation should be requested before destructive actions.

## 14. Document Format, Persistence, and Local Files

### 14.1 Native Project File

Use a versioned `.docstudio` format that preserves:

- Document metadata.
- Ordered content blocks and block identities.
- Inline formatting.
- Page setup, themes, and typography.
- Front page and visible-field configuration.
- Header/footer grids and page-numbering options.
- Embedded/referenced assets.
- Custom templates when saved as projects/templates.
- Relevant track-change data and saved revision history, under a documented persistence policy.

A manifest plus packaged assets (for example, a documented archive format) is a reasonable implementation approach. Final format design must be documented and schema-versioned. Add migrations when the schema changes in future versions.

### 14.2 Local Persistence

Use local files and suitable Tauri 2 capabilities. No server database or cloud storage is required. Handle missing or invalid files gracefully and avoid silent corruption. Include clear recovery/error messages.

### 14.3 Autosave and Recovery

Implement local recovery or autosave where feasible. Define when a recovery snapshot is created, how it is found after an unexpected shutdown, and how the user chooses to restore or discard it. Autosave must not silently overwrite a deliberately saved revision history.

### 14.4 Export Formats

- **PDF export is required.**
- A native `.docstudio` project is required for editable persistence.
- **DOCX import/export is a desirable interoperability feature**, subject to a feasibility/quality check. It must not compromise the reliability of the native format or PDF rendering. If high-fidelity DOCX conversion cannot be delivered reliably for v1.0, document the limitation and defer it rather than claiming full fidelity.

## 15. PDF Rendering and Preview Fidelity

The preview/export architecture is a high-risk engineering area and must be proven early.

Requirements:

- The preview is paginated and uses real target page dimensions.
- The exported PDF and the preview share one authoritative layout/rendering strategy.
- Same fonts/font metrics, widths, margins, line spacing, page breaks, table/image positioning, header/footer content, watermarks, and page numbering should produce the same layout.
- Long content and page-boundary behavior must be deliberate.
- Formula rendering, captions, signatures, lists, images, and tables must be tested.
- PDF output must work offline.
- PDF export failures must not alter or corrupt the native editable project.
- Margin guides in the preview are interface guides only; they must not accidentally appear in the exported PDF.

A rendering proof of concept must be built early, before extensive feature development. It should test at least two pages, page breaks, text wrapping, a local font, an image, and a table. The chosen approach must be recorded in the roadmap checkpoint.

Do not claim exact fidelity unless representative exported PDFs have been compared against the live preview.

## 16. Undo/Redo, Editing Usability, and Accessibility

- Provide undo/redo for core editing operations where practical.
- Provide useful keyboard shortcuts, including Ctrl+N, Ctrl+S, Ctrl+O and Ctrl+Z/Ctrl+Y where applicable.
- Do not intercept text-editing shortcuts incorrectly while the user is entering text in a field/editor.
- Show focus, hover, selected, disabled, and error states clearly.
- Make important controls keyboard-accessible.
- Use readable contrast in light, dark, multicolor, and monochrome/document-design modes.
- Long side panels should scroll independently.
- Large documents should not trigger unnecessary full-app rerenders on every keystroke.

## 17. Technical Architecture and Implementation Guidance

### 17.1 Required Stack

- React.
- TypeScript.
- Vite.
- Tauri 2.
- Rust/Tauri commands or official/local plugins only where desktop functionality requires them.

Do not add a remote backend, authentication service, or mandatory cloud dependency.

### 17.2 Suggested Separation of Responsibilities

Keep clear boundaries among:

- UI components: panels, toolbar, dialogs, editor controls and preview toolbar.
- Document model/types: stable, serializable source of truth.
- Document state/actions: create, update, reorder, duplicate, undo/redo, save, load and clear.
- Template library: predefined and user-created document templates.
- Theme system: separate application interface modes, cover themes, and body-page themes.
- Block registry/renderers: one well-defined model and renderer/editor path per block type.
- Pagination/layout: page composition and break decisions.
- PDF preview/export: based on the same authoritative layout/rendering approach.
- Local file services: dialogs, project persistence, images/assets, recovery and settings.
- Revision/history layer: tracked edits and saved snapshot comparison.

The exact folder structure and libraries may be chosen by the implementation agent, but should be documented and remain coherent. Avoid duplicate sources of truth and unnecessary dependencies.

### 17.3 Quality Expectations

- Strict TypeScript typing where practical; avoid unnecessary `any`.
- Reuse components and tokens.
- Keep user-visible strings and errors clear.
- Handle asynchronous file operations and failures.
- Use stable keys/IDs for blocks and revisions.
- Add tests for document-model transformations, serialization, revision comparison, and layout-sensitive features where practical.
- Run lint/type-check/build/test commands that exist in the project and report their actual results.
- Never say that a test passed unless it was run and passed.
- Do not add a large dependency for a small feature without explaining the trade-off.

## 18. Windows Build and Release

The final product must be built as a Windows desktop application with Tauri 2.

Release expectations:

- Application name: DocStudio.
- Version target: 1.0.
- Developer name metadata where applicable: Ikram ul Wahid.
- Application icon and suitable product metadata.
- All required front-end assets and offline resources packaged.
- No development-only URL/dependency in the production app.
- Test local new/open/save/reopen/duplicate/clear/export flows in the packaged build.
- Test with a representative multi-page document containing multiple block types, images and formulas.
- Verify behavior on a clean Windows environment.

Clarify the distribution artifact before release:

- A setup executable (for example, an NSIS setup `.exe`) installs the app.
- A portable standalone executable is different and must not be promised unless it is specifically built and tested.

WebView2/runtime requirements and installer behavior must be checked for the target environment. Core authoring functions should remain usable offline once the application is available on the machine.

## 19. Acceptance Standard for DocStudio v1.0

DocStudio v1.0 is ready for release only when all of the following are true:

1. The app builds and launches as a Tauri 2 Windows application.
2. The three-column UI and all required topbar actions are present and behave correctly.
3. Interface multicolor/light/dark modes do not alter document design unexpectedly.
4. Metadata, front page, page setup, typography, header/footer, statistics, and document actions work and persist.
5. Ten distinct cover themes and ten distinct body-page themes are implemented; monochrome modes preserve composition and readability.
6. Core text, heading, list, callout, table, formula, image, signature, break, metadata, and laboratory-specific blocks are editable and serializable.
7. Users can create documents from the laboratory/administrative template library and customize the template sections.
8. Native projects can be saved, reopened, duplicated, and recovered without silently losing supported content.
9. Track Changes, saved revision history/comparison, and an optional revision-history document section work to the stated scope. They are not represented as a secure audit trail.
10. The preview is genuinely paginated and PDF export is validated against it with representative documents.
11. Major actions have appropriate confirmations/errors, and statistics are grounded in actual document data/layout.
12. The production build works without a backend or mandatory internet connection.
13. Actual test/build results, known limitations, and packaging instructions are documented.

## 20. Authority and Change Policy

This file defines the permanent project baseline. While implementation is in progress:

- Do not modify this file merely to match what has already been implemented.
- Do not silently remove requirements because they are difficult.
- Do not treat incomplete implementation as a specification change.
- Record progress, decisions, test evidence, deferred items, and blockers in `project_roadmap.md`.
- If a genuine conflict or technical constraint is found, explain the evidence and propose an explicit decision for the project owner.
- Only modify this file when the project owner explicitly authorizes a requirement change. If authorized, make the change transparently and record the specification change in the roadmap history.

**End of permanent project specification.**
