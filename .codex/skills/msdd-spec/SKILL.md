---
name: msdd-spec
description: Turn a confirmed MSDD exploration into an implementation-ready specification and task list. Use after exploration when the user wants to define the feature before coding.
---

# MSDD Spec

Read the feature's `explore.md`, resolve material ambiguity with the user, and record confirmed decisions in the thirteen-section `spec.md`. Keep the `Explanation and Output Artifacts` section audience-focused: choose prose, diagram, interactive HTML, or narrated explainer video and use an 80%-ASD-STE100 writing profile unless the user specifies another level.

In `Technical Design`, make the change easy to understand technically:

- Include a short **Solution Description** with the proposed approach, main flow, and key decision.
- Include one or two minimal Mermaid diagrams in fenced `mermaid` blocks. Choose the diagram that explains the feature at a glance:

  | What the design needs to show | Diagram |
  | --- | --- |
  | How services or components connect | Architecture diagram |
  | The order of calls between components | Sequence diagram |
  | Decisions, branches, and failure paths | Flowchart |
  | How an item changes over its lifetime | State diagram |
  | Data entities and their relationships | ER diagram |

  Start with a sequence diagram when the main challenge is understanding the end-to-end flow. Add a flowchart for complex decision rules or a state diagram when valid transitions matter. Add a second diagram only when it explains a distinct, material part of the design. Show only change-relevant elements, use labels a non-technical reader can understand, and keep exact inputs, outputs, and error handling in the related text sections.

- Include these concise subsections: **Current State** (omit when it adds no context), **Proposed Design**, **Architecture / Components**, **Data Model / API Changes** (state “None” when applicable), **Technical Decisions**, **Trade-offs**, **Failure Handling**, and **Testing Strategy**.

Create the specification with:

```sh
msdd spec "Feature name"
```

The CLI generates `task.md`. The next workflow is `$msdd-build`.
