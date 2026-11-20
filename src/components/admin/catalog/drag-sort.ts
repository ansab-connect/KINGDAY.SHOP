"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

/** Moves one item of a list to a new index. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Drag-and-drop sorting with pointer events (mouse, pen and touch) plus arrow keys on the handle.
 * Spread `item(i)` on each sortable element and `handle(i, label)` on its drag handle (a button).
 */
export function useDragSort(count: number, onMove: (from: number, to: number) => void) {
  const group = useId();
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  function handle(index: number, label: string) {
    return {
      type: "button" as const,
      "aria-label": `Reorder ${label} (drag, or use the arrow keys)`,
      title: "Drag to reorder",
      style: { touchAction: "none" as const, cursor: drag ? "grabbing" : "grab" },
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0 || count < 2) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ from: index, over: index });
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (!drag) return;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const el = target?.closest<HTMLElement>(`[data-sort-group="${CSS.escape(group)}"]`);
        if (!el) return;
        const over = Number(el.dataset.sortIndex);
        if (Number.isInteger(over) && over !== drag.over) setDrag({ from: drag.from, over });
      },
      onPointerUp() {
        if (drag && drag.over !== drag.from) onMove(drag.from, drag.over);
        setDrag(null);
      },
      onPointerCancel() {
        setDrag(null);
      },
      onKeyDown(e: KeyboardEvent<HTMLElement>) {
        const back = e.key === "ArrowUp" || e.key === "ArrowLeft";
        const forward = e.key === "ArrowDown" || e.key === "ArrowRight";
        if (!back && !forward) return;
        e.preventDefault();
        const to = index + (back ? -1 : 1);
        if (to >= 0 && to < count) onMove(index, to);
      },
    };
  }

  function item(index: number) {
    return {
      "data-sort-group": group,
      "data-sort-index": index,
      "data-dragging": drag?.from === index ? "" : undefined,
      "data-drop-target": drag && drag.from !== index && drag.over === index ? "" : undefined,
    };
  }

  return { handle, item, dragging: drag !== null };
}

/** Classes for a sortable element: faded while dragged, gold ring where it will drop. */
export const sortableClass = "data-dragging:opacity-50 data-drop-target:ring-2 data-drop-target:ring-gold";
