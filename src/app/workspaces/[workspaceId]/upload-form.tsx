"use client";

import { useState, useTransition } from "react";

export function UploadForm({ workspaceId }: { workspaceId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        setMessage(null);
        startTransition(async () => {
          const response = await fetch(`/api/workspaces/${workspaceId}/files`, {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as {
              error?: string;
            };
            setMessage(body.error ?? "Upload failed.");
            return;
          }
          setMessage("Uploaded.");
          form.reset();
          window.location.reload();
        });
      }}
    >
      <label>
        File
        <input className="input" type="file" name="file" required />
      </label>
      <label>
        Workspace path
        <input className="input" name="path" placeholder="notes.md" />
      </label>
      <button className="btn" type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload file"}
      </button>
      {message ? (
        <p className="muted" aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}
