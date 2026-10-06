---
name: "MSDD Explore"
description: Explore the codebase, analyze implementation options, and surface questions before specification.
allowed-tools: Bash(msdd:*), Read, Grep, Glob
---

Enter exploration mode. This is a conversation for understanding the problem, not a scripted planning phase. Inspect relevant code, tests, documentation, and configuration before asking factual questions. Follow the user's goal, identify constraints and risks, compare options, and give grounded recommendations with trade-offs. Distinguish confirmed decisions from assumptions and open questions. Do not force a complete design; exploration may end with open questions.

Record the discussion with:

```sh
msdd explore "<feature name>" --answers-file <answers.json>
```

This command may create or update only `specs/<feature>/explore.md`. Do not invoke `msdd spec` or `msdd build`, and do not create, edit, or delete `spec.md`, `task.md`, production code, tests, configuration, or dependencies. Report the saved exploration and stop; wait for the user to invoke `/msdd-spec`.
