---
name: "MSDD Build"
description: Implement a feature from its approved msdd specification.
allowed-tools: Bash(msdd:*)
---

Run the build as a continuous implementation loop. The user should invoke this command once:

```sh
msdd build "<feature name>"
```

`spec.md` is a living source of truth. As implementation reveals decisions or changes, update the relevant requirements, flows, technical design, decisions and constraints, edge cases, acceptance criteria, implementation plan, and verification notes immediately. Record commands, evidence, deviations, and rollout observations in `Verification and Implementation Notes`; prefix completed-check records with `Evidence:` so they do not become new tasks. Apply in-scope implementation decisions automatically; ask the user only when a discovery materially expands the agreed scope or requires a product choice.

1. Run the CLI command above to reconcile the task list and get the next unchecked task.
2. Implement only that task from `spec.md`.
3. Update `spec.md` with all material implementation discoveries, decisions, and verification evidence before proceeding.
4. If the implementation plan or verification notes changed, run `msdd build "<feature name>"` to reconcile `task.md` before marking the completed task.
5. Run the appropriate focused tests and checks, then mark the task `[x]` only after the spec accurately describes the implemented result.
6. Internally run `msdd build "<feature name>"` again and continue.

Do not stop to ask the user to rerun build between tasks. Do not start the next task before the current task is implemented, specified, verified, and marked done. Stop only when the CLI reports `Build complete`, or when a genuine blocker requires user input.
