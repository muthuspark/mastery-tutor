---
name: "MSDD Explore"
description: Explore the codebase, analyze implementation options, and surface questions before specification.
allowed-tools: Bash(msdd:*), Read, Grep, Glob
---

Enter exploration mode. This is a conversation for understanding the problem, not a scripted planning phase. Inspect relevant code, tests, documentation, and configuration before asking factual questions. Follow the user's goal, identify constraints and risks, compare options, and give grounded recommendations with trade-offs. Distinguish confirmed decisions from assumptions and open questions. Do not force a complete design; exploration may end with open questions.

Use the existing command for its interactive investigation flow:

```sh
msdd explore "<feature name>" --answers-file <answers.json>
```

This command creates no artifact. Keep findings in the conversation, do not create `explore.md`, `spec.md`, `plan.md`, or `task.md`, and wait for the user to invoke `/msdd-spec`.
