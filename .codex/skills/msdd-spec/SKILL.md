---
name: msdd-spec
description: Turn confirmed feature intent into a high-level specification, low-level implementation plan, and checkable tasks.
---

# MSDD Spec

Use the confirmed exploration discussion and decisions. Do not require or read an `explore.md` artifact. Resolve material ambiguity with the user before finalizing.

Keep the artifacts distinct:

- `spec.md` is the high-level design: why the feature is needed, intent, goals, users, expected behavior, user/system flows, edge cases, constraints, and observable acceptance criteria. Keep implementation file changes and component-level decisions out of the spec.
- `plan.md` is the low-level design: components, responsibilities, interfaces, data flow, technical decisions, failure handling, verification mapping, affected files, and ordered implementation steps. Use a concise Mermaid diagram when it makes the design easier to understand.
- `task.md` is the agent execution checklist: small, independently checkable steps derived from the plan. Preserve acceptance-criteria coverage through plan verification steps.

Create all three artifacts with the existing command:

```sh
msdd spec "Feature name"
```

The command creates `spec.md`, `plan.md`, and `task.md` in `specs/<feature>/`. The next workflow is `$msdd-build`.
