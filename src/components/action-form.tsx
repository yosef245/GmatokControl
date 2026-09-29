"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/result";

/** A form bound to a server action that returns { error } or { ok }, showing the message under the fields. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnOk = false,
}: {
  action: (prev: ActionResult, data: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnOk && state && "ok" in state) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={run} className={`${className} aria-busy:cursor-wait aria-busy:opacity-70`} aria-busy={pending}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state && "error" in state && <p className="basis-full text-sm font-bold text-bad" role="alert">{state.error}</p>}
      {state && "ok" in state && <p className="basis-full text-sm font-bold text-ok" role="status">{state.ok}</p>}
    </form>
  );
}
