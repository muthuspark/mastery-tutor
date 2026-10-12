---
name: "MSDD Spec"
description: Turn an exploration into a detailed implementation specification.
allowed-tools: Bash(msdd:*)
---

Use the confirmed exploration decisions to complete every section of the detailed spec:

```sh
msdd spec "<feature name>"
```

Use valid, readable Markdown. Keep each required list item on its own bullet or numbered line; never combine a required list into prose. In particular, use `### Goals` and `### Non-goals`; `### Actors` and `### Scenarios`; the four subsections `### Confirmed Decisions`, `### Assumptions`, `### Constraints`, and `### Open Questions`; and five separate bullets for the Explanation and Output Artifacts fields.

In `Technical Design`, include a short **Solution Description** with the proposed approach, main flow, and key decision. Include one or two minimal Mermaid diagrams in fenced `mermaid` blocks: use an architecture diagram for component connections, a sequence diagram for call order, a flowchart for decisions and failure paths, a state diagram for lifecycle transitions, or an ER diagram for entity relationships. Start with a sequence diagram when the end-to-end flow is the main challenge. Add a second diagram only for a distinct, material design concern. Show only change-relevant elements, use non-technical labels, and keep exact inputs, outputs, and error handling in the related text sections.

Use concise **Current State** (omit when unnecessary), **Proposed Design**, **Architecture / Components**, **Data Model / API Changes** (state “None” when applicable), **Technical Decisions**, **Trade-offs**, **Failure Handling**, and **Testing Strategy** subsections.

Resolve open questions before finalizing. The spec is the source of truth for the build mode.
