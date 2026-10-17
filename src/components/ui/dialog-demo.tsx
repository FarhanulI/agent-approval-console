"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function DialogDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog demo</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Dialog primitive"
        description="This preview demonstrates the native modal dialog behavior."
        footer={
          <Button onClick={() => setOpen(false)} variant="secondary">
            Done
          </Button>
        }
      >
        <p className="text-sm leading-6 text-fg-muted">
          Escape and the close control dismiss the dialog. Closing through the
          controlled prop does not call the close callback again.
        </p>
      </Dialog>
    </>
  );
}