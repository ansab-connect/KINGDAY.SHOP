"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProductEditor } from "@/components/admin/catalog/product-editor";

type Props = Omit<React.ComponentProps<typeof ProductEditor>, "product" | "onDirtyChange">;

/**
 * "New product" always opens a fresh form. Next.js keeps a page's state when you leave
 * and come back, which used to bring back an old half-filled product (and old AI fill).
 * When this page is shown again we start over, asking first if there are unsaved changes.
 */
export function NewProductEditor(props: Props) {
  const [formKey, setFormKey] = useState(0);
  const dirty = useRef(false);
  const shownBefore = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  useEffect(() => {
    if (!shownBefore.current) {
      shownBefore.current = true;
      return;
    }
    if (!dirty.current || window.confirm("Start a new product? Your unsaved changes will be cleared.")) {
      dirty.current = false;
      setFormKey((k) => k + 1);
    }
  }, []);

  return <ProductEditor key={formKey} product={null} onDirtyChange={onDirtyChange} {...props} />;
}
