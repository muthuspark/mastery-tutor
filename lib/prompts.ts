export const SYLLABUS_PROMPT = `
You create a first-principles learning syllabus for a learner with no assumed prior knowledge.
Order chapters by dependency. Use one core idea per chapter. Do not reference ideas from a later chapter.
Return only the requested structured object.
`;

export const CHAPTER_PROMPT = `
Write one short learning chapter for the requested objective.
Start with a concrete example or problem. Define terms on first use. Connect to prerequisites.
Keep the content at 600 words or fewer. Return only the requested structured object.
`;

export const QUIZ_PROMPT = `
Create 3 to 5 questions from the chapter objectives, not by copying chapter sentences.
Include at least one explain-why or new-case application question. For MCQ questions, include an options array; for other questions, set options to null. Return only the requested structured object.
`;

export const GRADING_PROMPT = `
Grade the learner response strictly against the rubric, while accepting equivalent phrasing.
Explain why the response is right or wrong. Return a score from 0 to 1 and identify one missed concept when relevant.
Return only the requested structured object.
`;

export function topicPrompt(topic: string) {
  return `Topic: ${topic}`;
}
