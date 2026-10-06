export function dueChapterIndex(currentChapterIdx: number, previousMisses: number) {
  return currentChapterIdx + (previousMisses > 0 ? 2 : 1);
}
