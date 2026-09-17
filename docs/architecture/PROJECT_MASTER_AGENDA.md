# Forge AI — Project Master Agenda

AGENDA_VERSION: 1.6
LAST_UPDATED_AT: 2026-09-17T10:20:00-04:00
LAST_UPDATED_BY: LeadAI
CURRENT_VERIFIED_COMMIT: 9491fc46b927e6474fbd9ad0d3f85881dbeb4ff0
BRANCH: main
RUNTIME_STATE: Ollama reachable; installed Forge AI 0.1.6 running; GitHub Actions v0.1.6 is building the Windows installer
SCHEMA_OR_VERSION: application 0.1.6
CURRENT_STAGE: GITHUB-02 / PACKAGE RUNTIME VALIDATED
NEXT_STAGE: RELEASE-03 / Verify v0.1.6 GitHub assets and remote update path
AGENDA_SYNC_STATUS: SYNCED

## Verified baseline

- Production build succeeds.
- `qwen3.5:9b`, `Ornith:latest`, and `qwen2.5vl:3b` are installed in Ollama.
- UI and core interaction flows are implemented and were exercised through the Codex In-app Browser.
- Persistent Electron state exists at the local application user-data path.
- Graft wiring graph is synchronized with the source tree; deep semantic summaries are not built.
- Full evidence is in `outputs/local-ai-qa-report-2026-09-16.md`.

## Permanent project rules

- This is an independent project. Do not inherit another project's structure, runtime, database, credentials, or conventions.
- Cross-project copying is allowed only when the user explicitly names what to copy.
- Local-first operation through Ollama is the default.
- File writes, moves, copies, renames, and deletes require a visible plan and user approval.
- Do not create an installer unless the user explicitly asks for one.
- Do not execute destructive file tests against user data; use isolated fixtures.

## Completed

| ID | Item | Status | Evidence |
|---|---|---|---|
| UI-01 | Ollama-like responsive chat UI, themes, sidebar behavior | CLOSED | Browser AX/screenshot checks; sidebar signature removed and compact floating navigation remains visible |
| CHAT-01 | Conversation creation, persistence, archive, reorder, regenerate | CLOSED | Browser interaction checks; Electron state file |
| ATT-01 | File picker contract, drag/drop, image paste | CLOSED/PARTIAL | Browser drop/paste checks; native picker not automated |
| WEB-01 | DuckDuckGo search and public page transport | CLOSED/PARTIAL | HTTP 200 checks; live Electron web-tool loop has model gap |
| GRAFT-01 | Graft wiring index and query integration | CLOSED/PARTIAL | `graft check` and `graft ask --json --source` |
| RUNTIME-01 | Local model routing and computer time/calendar context | CLOSED/PARTIAL | Ollama API and settings UI checks |
| CLIP-01 | Electron OS clipboard bridge | CLOSED/PARTIAL | IPC path implemented; native clipboard read not automated |
| PDF-01 | Per-exchange PDF export path | CLOSED/PARTIAL | `printToPDF` path inspected; file generation not automated |
| FILE-01 | Read-only listing/read and approval-based operations | CLOSED/PARTIAL | Code/path safety inspection; no live mutation |

## Active findings

| ID | Finding | Status | Priority |
|---|---|---|---|
| FIX-01 | Ornith rejects multiple `system` messages with HTTP 500 | CLOSED | P0 |
| VISION-01 | Install and route image requests through qwen2.5vl:3b, Ornith, and verifier | CLOSED | P1 |
| UPD-01 | Installed-app in-place update through local release feed | CLOSED/PARTIAL | P1 |
| GITHUB-01 | Connect repository and publish Windows Release workflow | CLOSED/PARTIAL | P1 |
| UPD-02 | Bundle `electron-updater` production dependency in installed app | CLOSED | P1 |
| GITHUB-02 | Build and validate v0.1.6 Windows package | IN_PROGRESS | P1 |
| QA-02 | Add an Electron-native smoke harness for IPC, PDF, clipboard, location, and safe fixtures | READY_TO_START | P1 |
| FILE-02 | Delete operations are sent to Recycle Bin but are not represented in undo state | READY_TO_START | P1 |
| ATT-02 | DOCX/ODT/RTF and audio are accepted but not converted to model-readable text | READY_TO_START | P1 |
| MEM-01 | `clearMemory()` exists but has no visible settings control | READY_TO_START | P2 |
| GRAFT-02 | Exclude generated `outputs/release` from Graft context | READY_TO_START | P2 |

## Pending / deferred

- Native PDF export and download verification.
- Native file dialog and approved fixture write/move/copy/delete/undo verification.
- Windows location permission verification.
- Graft deep semantic build, if it becomes useful for this project.
- CSS consolidation after functional gaps are fixed.

## Approval gates

- `APPROVAL_REQUIRED`: any real user-data file mutation, deletion, overwrite, or external publication.
- No approval is required for the current read-only audit or isolated fixture tests.

## Next recommended work

After Action 35231213694 completes, verify the v0.1.6 GitHub Release assets and remote update detection/download/install on an isolated test machine or fixture.
