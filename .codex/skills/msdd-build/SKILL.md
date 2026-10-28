---
name: msdd-build
description: Implement an approved MSDD specification continuously, one verified task at a time.
---

# MSDD Build

Keep `spec.md` and `plan.md` current throughout implementation. The spec records high-level behavior and acceptance criteria. The plan records the actual technical design, interfaces, file changes, implementation steps, and verification approach. Update the correct artifact as implementation reveals or changes a material fact.

Update `spec.md` for changed requirements, flows, constraints, edge cases, or acceptance criteria. Update `plan.md` for architecture, interfaces, data contracts, file changes, technical decisions, implementation steps, and verification details. Record completed checks with an `Evidence:` prefix so they do not become tasks.

Apply in-scope decisions automatically. Stop for user direction only when a discovery materially expands scope or requires a product choice. Re-run `msdd build` after plan or verification changes so `task.md` is reconciled.

Start the continuous task loop with:

```sh
msdd build "Feature name"
```

Implement only the next unchecked task from `task.md`, verify it, update spec/plan with material discoveries and evidence, then mark the task `[x]`. Run `msdd build` again internally and continue until it reports completion or a genuine blocker requires user input.
