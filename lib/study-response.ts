import { NextResponse } from "next/server";
import { AssessmentError } from "./assessment-sessions";
export function studyJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function studyError(error: unknown) {
  return studyJson(
    {
      error: {
        message:
          error instanceof AssessmentError
            ? error.message
            : "Could not save your study session. Please try again.",
        retryable: !(error instanceof AssessmentError),
      },
    },
    error instanceof AssessmentError ? error.status : 500,
  );
}
