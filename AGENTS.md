# DocStudio — Agent Instructions

## 1. Read the Project Documents

Before making changes, consult:

1. `project_details.md` — authoritative product specification.
2. `project_roadmap.md` — current phase, checkpoint, status, and next task.

Do not assume that a planned feature has already been implemented.
Inspect the repository to establish the actual implementation state.

## 2. Authority of Project Documents

- `project_details.md` is the permanent product specification.
  Do not modify it unless the user explicitly authorizes a
  specification change.

- `project_roadmap.md` is the living development record.
  Update it after completing and verifying a meaningful checkpoint.

- If a proposed implementation conflicts with the product specification,
  do not silently change the requirements. Explain the conflict and
  follow the user-authorized scope.

## 3. Project Identity

- Application: DocStudio
- Version: 1.0
- Developer: Ikram ul Wahid
- Frontend: React, TypeScript, Vite
- Desktop framework: Tauri 2
- Target: Windows standalone desktop application

DocStudio is an offline-first document-authoring application for
laboratory documents, including ISO/IEC 17025-related documentation.

It is not a LIMS, QMS, cloud service, or document-control system.
Do not introduce backend services, login systems, approval workflows,
or unrelated enterprise features unless explicitly requested.

## 4. Development Discipline

- Work on one defined task or checkpoint at a time.
- Follow the current phase in `project_roadmap.md`.
- Do not implement later phases prematurely.
- Inspect relevant existing code before modifying it.
- Reuse existing components, types, utilities, and dependencies.
- Prefer small, coherent changes over broad rewrites.
- Avoid unrelated refactoring and unnecessary dependencies.
- Do not launch additional agents unless the user authorizes it
  or the task clearly warrants it.
- Never replace working functionality merely to simplify implementation.

## 5. Quota-Conscious Development

The project should be developed efficiently within the user's
available Antigravity usage allowance.

- Keep tasks narrow and acceptance criteria explicit.
- Avoid repeatedly analyzing the entire repository.
- Do not regenerate entire files when targeted edits are sufficient.
- Use local terminal commands for builds and tests.
- Do not repeat successful checks without a specific reason.
- Diagnose reported failures before attempting fixes.
- Do not continue to the next task automatically.

## 6. Verification Requirements

Before declaring a checkpoint complete:

1. Implement the defined scope.
2. Run relevant available checks.
3. Verify acceptance criteria against the actual result.
4. Report any failures or unverified behavior honestly.
5. Record the evidence in `project_roadmap.md`.

Never claim a build, test, export, or feature works unless
the relevant behavior has actually been verified.

Distinguish between implemented, tested, partially tested,
and planned functionality.

## 7. Roadmap Maintenance

After each meaningful checkpoint, update `project_roadmap.md`
with:

- Checkpoint identifier and description.
- Status: complete, partial, blocked, or not started.
- Files or components changed.
- Tests and commands executed.
- Results and supporting evidence.
- Known issues and unresolved decisions.
- Any deviation from the planned scope.
- The next recommended checkpoint.

Do not mark a phase complete merely because its code exists.
Use the phase's acceptance criteria and required evidence.

Preserve earlier checkpoint history. Do not invent test results
or delete unresolved issues to make progress appear better.

## 8. Final Response for Each Task

After each task, briefly report:

1. What was implemented.
2. Which files changed.
3. Which checks were executed and their results.
4. Any remaining problems.
5. The roadmap checkpoint status.

Stop after the requested task. Wait for the user's next instruction.