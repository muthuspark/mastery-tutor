export const SYLLABUS_PROMPT = `
You create a first-principles learning syllabus for a learner with no assumed prior knowledge.
Order chapters by dependency. Use one core idea per chapter. Do not reference ideas from a later chapter.
Return only the requested structured object.
`;

export const CHAPTER_PROMPT = `
Write one short learning chapter for the requested objective.
Start with a concrete example or problem. Define terms on first use. Connect to prerequisites.
Keep the content at 600 words or fewer. Use inline LaTeX like $E=mc^2$ or display LaTeX like $$f(x)=x^2$$ when a formula makes the idea clearer. Use a fenced Mermaid block only when a relationship, sequence, or architecture is genuinely easier to understand as a diagram. Mermaid blocks must use valid syntax, for example \`\`\`mermaid\nflowchart TD\n  A[Start] --> B[Learn]\n\`\`\`. Do not add decorative diagrams or formulas. Return only the requested structured object.
`;

export const QUIZ_PROMPT = `
Create exactly 10 different objective questions from the chapter objectives, not by copying chapter sentences.
Every question must be multiple choice with exactly four concise, distinct options and exactly one correct answer. Make the three distractors plausible, topic-relevant misconceptions; do not use obviously unrelated or silly options. Include application and new-case questions, not only definition recall. Return only the requested structured object.
`;

export const GRADING_PROMPT = `
Grade the learner response strictly against the rubric, while accepting equivalent phrasing.
Explain why the response is right or wrong. Return a score from 0 to 1 and identify one missed concept when relevant.
Return only the requested structured object.
`;

export function topicPrompt(topic: string) {
  return `Topic: ${topic}`;
}
