import Link from "next/link";

type ReadingPageStateProps =
  | { kind: "loading"; message: string }
  | {
      kind: "failure";
      heading: string;
      message: string;
      backHref: string;
      pending?: boolean;
      preparing?: boolean;
      onRetry?: () => void;
    };

/** Uses the same reading geometry and Paper & Ink controls as lesson content. */
export function ReadingPageState(props: ReadingPageStateProps) {
  if (props.kind === "loading") {
    return <main className="reading-shell"><p role="status" className="ui text-sm text-[var(--muted)]">{props.message}</p></main>;
  }

  return <main className="reading-shell">
    <h1 className="display mt-16 text-4xl leading-none">{props.heading}</h1>
    <p role={props.pending || props.preparing ? "status" : "alert"} className="ui mt-5 text-sm text-[var(--muted)]">{props.message}</p>
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      {props.onRetry ? <button type="button" className="button-primary ui" disabled={props.pending} onClick={props.onRetry}>{props.pending ? "Trying again…" : "Try again"}</button> : null}
      <Link prefetch={false} href={props.backHref} className="button-secondary ui">Back to course</Link>
    </div>
  </main>;
}
