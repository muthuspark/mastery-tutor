# Exploration: Chapter explanation levels

## Context

The user requests easier and slightly harder explanation buttons at the end of every generated chapter, immediately above Check your understanding. Each click generates a new explanation in place. The suggested range is very simple through scientist-level; age labels are examples and the user requests better level recommendations. Exploration only.

## Codebase Analysis

Findings reflect the current working tree, including pre-existing uncommitted chapter adjustment/version work, which was left untouched and not tested here.
- components/chapter-page.tsx: Too easy and Too hard buttons already exist below the quiz action. Feedback triggers generation, polling and stacked rendering of original and subsequent explanations.
- lib/chapter.ts: depthHint easy means previous explanation was too easy and produces deeper text; hard produces simpler text. Previous content is included as reference. Generation returns content, pretest and summary together and explicitly describes appending below the earlier text.
- app/api/chapters/[id]/route.ts: feedback snapshots current content, invalidates generation and queues the next version.
- lib/chapter-response.ts and lib/db/schema.ts: persisted chapter versions contain directional depthHint, not an absolute explanation level.
- lib/generation.ts: invalidating chapter generation also invalidates the quiz and increments content version.
- lib/socratic.ts and the chapter page: practice is tied to the content version, so a new explanation affects ongoing practice.
- Prompts include learner background, objectives, prior summaries, missed concepts and, for reviewed courses, teaching boundaries and quality review.
- PRODUCT.md emphasizes sustained reading, accessible controls, evidence-based progress and preserving learner data. DESIGN.md contains unrelated template material; use existing chapter UI and product context for this exploration.
No production source, tests, dependencies, configuration, specification or task files were changed.

## Recommendations

All recommendations below await user confirmation.
Use six explanation-depth levels rather than age or intelligence labels:
1. Intuitive: plain words, familiar analogies, minimal assumed knowledge.
2. Guided: small steps, defined terms and a fully worked example.
3. Applied: realistic problems and why each step works.
4. Technical: precise terminology, formal mechanisms and relevant notation.
5. Advanced: derivations, assumptions, trade-offs and edge cases.
6. Research: specialist detail, limitations and competing approaches where appropriate. Do not fabricate findings or citations.
These describe presentation and assumed subject knowledge, not learner proficiency. Apply math only where relevant. Simpler can mean longer: preserve correctness and objectives while adding scaffolding. Even deeper versions must respect the chapter boundary and prerequisites.
Place two secondary controls, Explain more simply and Explain in more depth, above the primary quiz action. Display Current explanation: Guided (2 of 6). Each click moves exactly one adjacent absolute level. Derive and validate the target on the server from the accepted level.
Keep the current content readable during generation. Replace active text only on success, preserve original and prior versions behind a compact history control, and retain current content/level on failure. Prevent concurrent requests, announce loading/errors accessibly and disable unavailable directions at boundaries with an explanation. Reuse an existing version at the requested level when its source context is unchanged.
Store an explicit level per explanation. Existing easy/hard feedback cannot reliably represent a cumulative ladder. Initial level could follow learner background, otherwise a declared Guided default; this is not a measured classification of legacy chapters.
Keep mastery objectives, completed progress and assessment expectations stable when explanation depth changes. Decide explicitly how to handle quizzes and version-bound Socratic sessions. Extending current chapter versions reuses substantial existing work but retains quiz/summary/practice coupling. An explanation-specific variant model separates presentation from canonical content and progress at the cost of a larger data-model change.

## Open Questions

Open choices:
- Does in place mean replacing active text with history available (recommended), or stacking every explanation as current working-tree code does?
- Adopt the six proposed levels? Offer only adjacent buttons initially, or also a direct level picker?
- Keep the chosen level local to each chapter initially (recommended), or remember it for future chapters?
- Keep quizzes tied to stable mastery requirements (recommended), or also change their presentation depth? Current regeneration invalidates them.
- How should legacy chapters without explicit levels be initialized without claiming measured difficulty?
Research depth is limited by prerequisites and available evidence. The labels must work across subjects rather than assume every course is scientific.

## Decisions Confirmed

Confirmed user direction: generated chapters need easier and slightly harder explanation controls just above Check your understanding, generating a new explanation within the chapter across an ordered simple-to-sophisticated range. Age labels are tentative suggestions. Six labels, initial level, history behavior, cache policy, persistence scope and assessment behavior are recommendations, not confirmed decisions. Only msdd-explore was invoked. Wait for an explicit msdd-spec invocation before producing a specification or task list.


## Follow-up: labels, starting level and generation prompts

Confirmed: button labels “Simpler” and “More depth”. This supersedes the earlier proposed button labels. The user asks where the original explanation starts and proposes familiar “explain like I am 5” instructions in prompts. The starting level and full prompt ladder remain recommendations awaiting confirmation.

Recommendation: new original explanations explicitly target Guided (level 2 of 6). This gives a beginner-friendly original, one simpler step to Intuitive, and four deeper steps. “Original” describes generation history, not a separate complexity level. Current generation adapts to learner background without an explicit level, so existing originals cannot honestly be assigned a measured level retrospectively. Display Original for legacy content until a defined target is generated, and resolve its adjustment baseline during specification. Keep the initial default predictable; background can personalize examples within the chosen level.

Recommended prompt intent:
- Intuitive: “Explain like I am 5.” Use everyday words, a familiar concrete analogy and small reasoning steps. Define unavoidable terms. Avoid baby talk, preserve accuracy and explain where analogies stop matching the concept.
- Guided: “Explain to a curious beginner with no prior knowledge of this topic.” Define terms, build step by step and include a fully worked example.
- Applied: “Explain to a learner who knows the basics and wants to use this.” Show realistic applications and why each step works.
- Technical: “Explain to someone comfortable with the prerequisites who wants the formal mechanism.” Use precise terminology and relevant notation, introducing each symbol.
- Advanced: “Explain to an advanced learner who wants to derive and critique the method.” Include assumptions, relevant derivations, trade-offs and edge cases.
- Research: “Explain to a specialist examining the limits of this account.” Discuss evidence, limitations and competing approaches within the chapter boundary. Do not invent findings or sources.

ELI5 is a useful familiar prompt for the easiest level, paired with explicit output constraints. Age alone does not define prerequisites, factual coverage or mathematical treatment. Easier versions must still teach chapter objectives with scaffolding; deeper versions must respect chapter boundaries and not assume unexplained later-course prerequisites. Prefer neutral UI level names, optionally showing “Explain like I’m 5” as help text for Intuitive, while using ELI5 explicitly in generation instructions.


## Confirmed: expand the chapter and retain all explanations

The user explicitly confirmed that clicking Simpler or More depth must retain previous text. Each completed explanation is appended below all existing chapter explanations. The chapter expands; it does not replace or rewrite earlier text. All prior explanations remain visible, rather than being hidden behind a history control. This supersedes earlier recommendations to replace the active explanation and keep previous versions behind compact history.

Place the shared Simpler / More depth controls at the end of the expanded chapter, immediately above Check your understanding. Recommend labeling each added explanation with its target depth. Adjacent-level movement should use the latest successfully appended explanation as the baseline. While generating, keep all existing text readable and show progress at the insertion point. On failure, preserve every accepted explanation and keep the accepted level unchanged. The existing working-tree stacked explanation presentation aligns with this confirmed direction.

The user's positive response supports the discussed direction, but the exact initial default and six-level prompt taxonomy remain proposals unless explicitly confirmed. Returning to a level already shown raises an open choice: append a newly generated alternative, or navigate to the existing explanation. This exploration does not assume that caching may override the user's expectation that a button adds an explanation.
