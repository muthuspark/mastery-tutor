---
name: "MSDD Spec"
description: Create a high-level spec, low-level plan, and checkable task list.
allowed-tools: Bash(msdd:*)
---

Use confirmed decisions from the exploration conversation. Do not require an `explore.md` file. Resolve material ambiguity before finalizing.

Keep the artifacts distinct:

- `spec.md` is the high-level design: intent, goals, users, expected behavior, flows, edge cases, constraints, and observable acceptance criteria.
- `plan.md` is the low-level design: components, interfaces, data flow, technical decisions, affected files, failure handling, verification mapping, and ordered implementation steps.
- `task.md` is the plan broken into small, independently checkable steps for the agent.

Create all three using the existing command:

```sh
msdd spec "<feature name>"
```

The next workflow is `/msdd-build`.
