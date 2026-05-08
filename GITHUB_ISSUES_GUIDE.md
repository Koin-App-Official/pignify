# GitHub Issues & Milestones Guide for AI Dev Agents

This guide defines the mandatory workflow for all AI coding agents working on the **Piggnify** project. Following these rules ensures project discipline, traceability, and clear progress tracking.

---

## 🚀 The AI Agent Workflow

Every time a new task is started, the AI agent **MUST** follow these phases:

### 1. Initialisation Phase
*   **Action**: Search for existing issues using `github_search_issues` (or equivalent tool).
*   **Create**: If not found, create an issue using `github_create_issue` (or `issue_write`).
*   **Update**: If an issue is found, update it appropriately with the new context or checklist items.

### 2. Execution Phase
*   **Branches**: Specific branches should be created for every issue using the naming convention: `feat/issue-ID-short-description` or `fix/issue-ID-short-description`.
*   **Commits**: All commit messages must reference the issue ID using the format `[#ISSUE_ID] Commit message` (e.g., `[#12] Add responsive styles to header`).

### 3. Completion Phase
*   **Action**: Follow the strict flow: **Verification** -> **Closing** -> **Comment**. First, verify that the implementation meets all requirements. Then, close the issue. Finally, add a comment summarizing the completion of the task.

---

## 🏷️ Standard Labels

Apply these standard labels when creating issues to maintain organization:
- `bug`
- `documentation`
- `duplicate`
- `enhancement`
- `refactor`
- `urgent`

---

## 📝 Issue Template Standards

AI agents should use the following structure when creating issues:

```markdown
## Overview
Briefly describe the purpose of this task.

## Requirements
- Requirement A
- Requirement B

## Tasks
- [ ] Task 1
- [ ] Task 2
- [ ] Final verification
```

---

## 🎯 Milestone Discipline

*   **Check First**: Agents must list current milestones at the start of a session.
*   **Alignment**: Every issue created should ideally be tied to an active milestone to ensure we are moving toward our project goals.
*   **Closing**: If an agent completes the last issue in a milestone, it should notify the user that the milestone is ready for review/closure.

---

## 🛠 Required Tools Usage

Agents must use the `mcp_github-mcp-server` tools:
*   `list_issues` & `search_issues`: To stay informed.
*   `issue_write`: To create and update issues.
*   `pull_request_read/write`: To link code changes to tracking.

---

> [!IMPORTANT]
> **Discipline is non-negotiable.** Do not proceed with implementation until the tracking issue is established or identified.
