---
name: msdd-build
description: Implement an approved MSDD specification continuously, one verified task at a time. Use when the user wants to build the feature defined in spec.md.
---

# MSDD Build

`spec.md` is a living source of truth throughout implementation, not a document frozen at the start. Update it automatically whenever implementation reveals or changes a material fact; do not wait until the end of the coding session.

## Keep the specification current

As you work, immediately record implementation discoveries in the relevant spec sections:

- **Requirements**, **User/System Flows**, and **Acceptance Criteria** for changed behavior or observable outcomes.
- **Technical Design** for the actual architecture, interfaces, data contracts, dependencies, and diagrams.
- **Decisions and Constraints** for decisions made, rationale, assumptions invalidated, and constraints discovered.
- **Edge Cases and Failure Handling** for newly discovered failure paths and recovery behavior.
- **Implementation Plan** when work is added, removed, reordered, or split.
- **Verification and Implementation Notes** for commands run, evidence, deviations, and rollout observations. Prefix completed-check records with `Evidence:` so they document the result without becoming another task.

Update the spec before proceeding to the next task. Re-run `msdd build` after any implementation-plan or verification change so `task.md` is reconciled with the current source of truth. Mark a task complete only after the spec accurately describes the implemented result and the verification evidence is recorded. Apply in-scope decisions automatically; stop for user direction only when a discovery materially expands the agreed scope or requires a product choice.

Start the continuous task loop with:

```sh
msdd build "Feature name"
```

Implement only the task returned by the CLI, update `spec.md` with relevant decisions and evidence, run focused verification, mark that task `[x]` in `task.md`, and run the build command again internally. Continue until it reports completion or a genuine blocker requires user input.
