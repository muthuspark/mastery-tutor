export type McqWithOptions = {
  options: string[];
  modelAnswer: string;
};

type RandomSource = () => number;

const OPTION_COUNT = 4;

export class AssessmentQualityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssessmentQualityError";
  }
}

export function normalizeOption(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function assertValidMcq(question: McqWithOptions) {
  if (question.options.length !== OPTION_COUNT) {
    throw new AssessmentQualityError(`Questions must have exactly ${OPTION_COUNT} options.`);
  }

  const options = question.options.map(normalizeOption);
  if (options.some((option) => !option)) {
    throw new AssessmentQualityError("Question options cannot be blank.");
  }
  if (new Set(options).size !== options.length) {
    throw new AssessmentQualityError("Question options must be distinct.");
  }

  const answer = normalizeOption(question.modelAnswer);
  if (!answer || options.filter((option) => option === answer).length !== 1) {
    throw new AssessmentQualityError("The model answer must match exactly one option.");
  }
}

export function isValidMcq(question: McqWithOptions) {
  try {
    assertValidMcq(question);
    return true;
  } catch {
    return false;
  }
}

export function isBalancedQuiz(questions: readonly McqWithOptions[]) {
  if (questions.length !== 10 || !questions.every(isValidMcq)) return false;
  const counts = [0, 0, 0, 0];
  for (const question of questions) {
    const position = question.options.findIndex((option) => normalizeOption(option) === normalizeOption(question.modelAnswer));
    counts[position] += 1;
  }
  return counts.every((count) => count === 2 || count === 3);
}

function shuffled<T>(values: readonly T[], random: RandomSource) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function createBalancedPositionPlan(questionCount: number, random: RandomSource = Math.random) {
  if (!Number.isInteger(questionCount) || questionCount < OPTION_COUNT) {
    throw new AssessmentQualityError("A position plan needs at least four questions.");
  }

  const positions = Array.from({ length: OPTION_COUNT }, (_, index) => index);
  const plan = Array.from({ length: questionCount }, (_, index) => positions[index % OPTION_COUNT]);
  return shuffled(plan, random);
}

export function reorderOptions<T extends McqWithOptions>(question: T, correctPosition: number, random: RandomSource = Math.random): T {
  assertValidMcq(question);
  if (!Number.isInteger(correctPosition) || correctPosition < 0 || correctPosition >= OPTION_COUNT) {
    throw new AssessmentQualityError("Correct position must be between 0 and 3.");
  }

  const answer = normalizeOption(question.modelAnswer);
  const correctOption = question.options.find((option) => normalizeOption(option) === answer);
  if (!correctOption) throw new AssessmentQualityError("The model answer must match exactly one option.");

  const distractors = shuffled(question.options.filter((option) => normalizeOption(option) !== answer), random);
  const options = [...distractors];
  options.splice(correctPosition, 0, correctOption);
  return { ...question, options };
}

export function balanceQuizOptions<T extends McqWithOptions>(questions: readonly T[], random: RandomSource = Math.random) {
  const plan = createBalancedPositionPlan(questions.length, random);
  return questions.map((question, index) => reorderOptions(question, plan[index], random));
}
