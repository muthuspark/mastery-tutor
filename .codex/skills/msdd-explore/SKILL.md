---
name: msdd-explore
description: Explore a feature before specifying it. Use when the user asks to investigate a codebase, compare implementation options, surface constraints, or clarify a feature in MSDD.
---

# MSDD Explore

Enter exploration mode. Treat this as a conversation for understanding a problem, not a scripted planning phase.

## Boundary

Explore may inspect the repository and record the discussion, but it must not create a specification, a task list, or production code. The user's use of `$msdd-explore` authorizes only the creation or update of `specs/<feature>/explore.md`.

Do not invoke `msdd spec` or `msdd build`. Do not create, edit, or delete `spec.md`, `task.md`, production source, tests, configuration, or dependencies. After saving the exploration, stop and wait for the user to explicitly invoke `$msdd-spec`.

## How to explore

- Inspect relevant code, tests, documentation, and configuration before asking factual questions that the repository can answer.
- Follow the user’s goal and investigate the most relevant constraints, patterns, risks, and integration points.
- Ask focused questions only when an answer changes scope, architecture, dependencies, behavior, or acceptance criteria.
- Give grounded recommendations with concise trade-offs. Clearly distinguish confirmed decisions from assumptions and open questions.
- Use diagrams, examples, or comparisons when they make a complex idea easier to understand.
- Do not force a fixed sequence of questions or a complete design. Exploration may end with open questions.

## Record the exploration

When the discussion has enough useful context, save only the exploration:

```sh
msdd explore "Feature name"
```

The saved record should cover the context, codebase findings, recommended approach and trade-offs, open questions, and decisions the user has explicitly confirmed. Report where it was saved, then stop.
