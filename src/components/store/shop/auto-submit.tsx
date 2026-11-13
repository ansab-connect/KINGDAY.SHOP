"use client";

import { useEffect, useRef } from "react";

/**
 * Drop inside a GET <form> to submit it whenever a control changes.
 * Without JavaScript the form still works through its Apply button.
 */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.type === "number") return; // price fields submit on Enter / Apply
      form.requestSubmit();
    };
    form.addEventListener("change", onChange);
    form.dataset.autosubmit = "true";
    return () => form.removeEventListener("change", onChange);
  }, []);
  return <span ref={ref} hidden />;
}
