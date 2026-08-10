"use client";

// Confirm guard for the destructive import rollback. Wraps the server action in
// a form and asks before firing, since a rollback permanently deletes the
// participants that import created.
export function RollbackButton({
  action,
  importId,
  fileName,
  count,
}: {
  action: (formData: FormData) => void;
  importId: string;
  fileName: string;
  count: number;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const n = count === 1 ? "1 participant" : `${count} participants`;
        if (!confirm(`Roll back “${fileName}”? This permanently deletes ${n} this import created.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={importId} />
      <button className="link-btn danger" type="submit">
        Roll back
      </button>
    </form>
  );
}
