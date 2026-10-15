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

## Git Commit and Push Policy

### 1. General Rule

After completing a requested major or minor development checkpoint:

1. Implement the requested scope.
2. Run relevant tests and build checks.
3. Verify the acceptance criteria.
4. Update `project_roadmap.md` with the actual status and evidence.
5. Review the Git working tree and changes.
6. Commit and push the verified checkpoint to GitHub.

The user authorizes routine commits and pushes for verified checkpoints. Do not ask for separate permission each time.

### 2. Branch Safety

- Never push directly to `main`.
- Before modifying files, check the current Git branch.
- If the current branch is `main`, create a suitable feature branch before implementing changes.
- Use descriptive branch names, for example `opencode/p02-m1-r1`.
- Push the current branch using `git push -u origin HEAD` where appropriate.
- Do not merge pull requests or merge feature branches into `main` automatically.

### 3. Commit Safety

- Stage only files related to the current task or checkpoint.
- Review `git diff` and `git diff --cached` before committing.
- Do not include secrets, API keys, credentials, `.env` files, unnecessary build artifacts, or local-only files.
- Use a descriptive commit message that identifies the change and, where appropriate, its checkpoint.
- Never force-push, rewrite published history, or amend an already-pushed commit.
- Do not commit unrelated user changes.

### 4. Verification and Failure Handling

- Never mark a checkpoint complete unless its acceptance criteria have been verified.
- If required tests fail, unrelated changes are present, the branch has diverged, or a Git operation fails, stop before pushing and report the issue.
- Do not claim that changes have reached GitHub without confirming that the push succeeded.
- If the remote rejects a push, investigate the cause rather than using a force push.

### 5. Final Report

After a successful push, report:

- What was implemented.
- Tests and build checks performed, with actual results.
- The updated roadmap checkpoint status.
- The commit hash and message.
- The remote branch name and push result.
- Any remaining limitations.
- The next recommended checkpoint.

Always distinguish between a feature branch being pushed and its changes being merged into `main`.