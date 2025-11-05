import React, { useEffect, useState } from "react";
import type { WorkspaceIdType } from "@/core/constants/workspaces";
import { listLocalWorkspaces } from "@/workspaces/registry"; // you already have this from earlier tests

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (destWorkspaceId: WorkspaceIdType, move: boolean) => void;
  currentWorkspaceId: WorkspaceIdType;
  title?: string; // e.g. "Copy to…"
};

export default function CopyToModal({ open, onClose, onConfirm, currentWorkspaceId, title = "Copy to…" }: Props) {
  const [workspaces, setWorkspaces] = useState<Array<{ id: WorkspaceIdType; name: string }>>([]);
  const [dest, setDest] = useState<WorkspaceIdType | null>(null);
  const [move, setMove] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const all = await listLocalWorkspaces();
      const filtered = all.filter(w => w.id !== currentWorkspaceId);
      setWorkspaces(filtered);
      setDest(filtered[0]?.id ?? null);
      setMove(false);
    })();
  }, [open, currentWorkspaceId]);

  if (!open) return null;

  return (
    <div role="dialog" aria-label="copy to" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <h2 className="text-lg font-semibold mb-3">{title}</h2>

        <label className="block text-sm mb-1">Destination workspace</label>
        <select
          className="w-full rounded-lg border px-3 py-2"
          value={dest ?? ""}
          onChange={e => setDest(e.target.value as WorkspaceIdType)}
        >
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={move} onChange={e => setMove(e.target.checked)} />
          Move (copy then delete from source)
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg px-3 py-2 border" onClick={onClose}>Cancel</button>
          <button
            className="rounded-lg px-3 py-2 bg-black text-white disabled:opacity-50"
            disabled={!dest}
            onClick={() => { if (dest) onConfirm(dest, move); }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
