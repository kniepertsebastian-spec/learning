"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/lib/i18n";

type Request = { message: string; title?: string; confirmLabel?: string; destructive?: boolean; resolve: (ok: boolean) => void };

/**
 * Bestätigung als Dialog statt `window.confirm` (gleiche Optik in hell/dunkel, Fokus bleibt im Dialog, Esc bricht ab).
 * `const [confirm, confirmDialog] = useConfirm()` – `confirmDialog` einmal rendern, dann `if (!(await confirm("…"))) return;`.
 */
export function useConfirm() {
  const { t } = useLocale();
  const [request, setRequest] = React.useState<Request | null>(null);

  const confirm = React.useCallback(
    (message: string, opts: { title?: string; confirmLabel?: string; destructive?: boolean } = {}) =>
      new Promise<boolean>((resolve) => setRequest({ message, ...opts, resolve })),
    [],
  );

  function close(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  const dialog = (
    <Dialog open={request !== null} onOpenChange={(open) => !open && close(false)}>
      <DialogContent closeLabel={t.common.close} data-testid="confirm-dialog">
        <DialogTitle>{request?.title ?? t.common.confirmTitle}</DialogTitle>
        <DialogDescription className="text-sm text-muted">{request?.message}</DialogDescription>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)} data-testid="confirm-cancel">{t.common.confirmNo}</Button>
          <Button variant={request?.destructive ? "inverted" : "primary"} onClick={() => close(true)} data-testid="confirm-accept">{request?.confirmLabel ?? t.common.confirmYes}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog] as const;
}
