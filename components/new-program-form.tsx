"use client";

import { useState } from "react";
import { createProgram } from "@/app/(app)/programs/actions";

export function NewProgramForm({ sites }: { sites: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="form-trigger" onClick={() => setOpen(true)}>
        + New program
      </button>
    );
  }

  return (
    <form action={createProgram} className="np-form">
      <label>
        <span>Name</span>
        <input name="name" required placeholder="e.g. Chess Club" autoFocus />
      </label>
      <label>
        <span>Category</span>
        <select name="category" defaultValue="enrichment">
          <option value="tutoring">Tutoring</option>
          <option value="STEM">STEM</option>
          <option value="sports">Sports</option>
          <option value="arts">Arts</option>
          <option value="enrichment">Enrichment</option>
        </select>
      </label>
      <label>
        <span>Site</span>
        <select name="siteId" defaultValue={sites[0]?.id ?? ""}>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Capacity</span>
        <input name="capacity" type="number" min="1" placeholder="20" />
      </label>
      <button className="btn-primary" type="submit">
        Create program
      </button>
      <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
