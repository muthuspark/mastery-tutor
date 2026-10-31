export class StudyRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function studyRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw new StudyRequestError(
      body?.error?.message ??
        "Could not load your study session. Please try again.",
      response.status,
    );
  return body;
}
