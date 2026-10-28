---
name: "MSDD Build"
description: Implement a feature from its approved msdd specification.
allowed-tools: Bash(msdd:*)
---

Run the build as a continuous implementation loop. The user should invoke this command once:

```sh
msdd build "<feature name>"
```

`spec.md` and `plan.md` are living sources of truth. Keep `spec.md` focused on high-level behavior, constraints, edge cases, and acceptance criteria. Keep `plan.md` current with technical design, interfaces, data flow, file changes, implementation steps, and verification details. Record completed-check records with `Evidence:` so they do not become new tasks. Apply in-scope implementation decisions automatically; ask the user only when a discovery materially expands the agreed scope or requires a product choice.

1. Run the CLI command above to reconcile the task list and get the next unchecked task.
2. Implement only that task from `plan.md`, using `spec.md` for expected behavior and acceptance criteria.
3. Update `spec.md` or `plan.md` with material discoveries and verification evidence before proceeding.
4. If plan implementation steps or verification changed, run `msdd build "<feature name>"` to reconcile `task.md` before marking the completed task.
5. Run the appropriate focused tests and checks, then mark the task `[x]` only after the spec accurately describes the implemented result.
6. Internally run `msdd build "<feature name>"` again and continue.

Do not stop to ask the user to rerun build between tasks. Do not start the next task before the current task is implemented, specified, verified, and marked done. Stop only when the CLI reports `Build complete`, or when a genuine blocker requires user input.
