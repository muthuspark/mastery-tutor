---
name: msdd-explore
description: Explore a feature before specification. Use when the user asks to investigate a codebase, compare options, identify constraints, or clarify a feature in MSDD.
---

# MSDD Explore

Explore the problem and codebase before the user invokes `$msdd-spec`. Treat this as investigation and discussion, not a document-authoring phase.

Inspect relevant code, tests, documentation, and configuration. Identify constraints, risks, patterns, and integration points. Give grounded recommendations and trade-offs. Distinguish confirmed decisions from assumptions and open questions. Ask only questions that affect scope, behavior, dependencies, architecture, or acceptance criteria.

The existing `msdd explore` command remains available for its interactive investigation flow. It does not create or update `explore.md` or any other artifact. Keep findings in the conversation until the user invokes `$msdd-spec`.

Do not create or edit `spec.md`, `plan.md`, `task.md`, production code, tests, or configuration during exploration. Stop after exploration and wait for the user to invoke `$msdd-spec`.
