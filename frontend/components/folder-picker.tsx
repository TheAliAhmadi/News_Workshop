"use client";
import { useEffect, useState } from "react";
import {
  ArrowUp,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { api } from "@/lib/api";

type Listing = {
  path: string;
  name: string;
  parent: string | null;
  folders: { name: string; path: string }[];
  shortcuts: { name: string; path: string }[];
};

/** Pick a folder on this computer by clicking, like a system file dialog. */
export function FolderPicker({
  title,
  description,
  confirm,
  start,
  onPick,
  close,
}: {
  title: string;
  description: string;
  /** Text of the final button, e.g. "Use this folder". */
  confirm: string;
  start?: string;
  onPick: (path: string) => Promise<void> | void;
  close: () => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState<string | null>(null);
  const go = async (path?: string) => {
    setBusy(true);
    setError("");
    try {
      setListing(await api<Listing>("/browse", { path }));
      setNewName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    // Fall back to the home folder when the starting folder is gone.
    api<Listing>("/browse", { path: start })
      .catch(() => api<Listing>("/browse", {}))
      .then(setListing)
      .catch((e) => setError(e.message));
  }, [start]);
  const create = async () => {
    if (!listing || !newName?.trim()) return;
    setBusy(true);
    setError("");
    try {
      setListing(
        await api<Listing>("/browse/folder", {
          path: listing.path,
          name: newName,
        }),
      );
      setNewName(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    if (!listing) return;
    setBusy(true);
    setError("");
    try {
      await onPick(listing.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} description={description} close={close}>
      {listing?.shortcuts && (
        <div className="picker-shortcuts" role="group" aria-label="Places">
          {listing.shortcuts.map((s) => (
            <Button
              key={s.path}
              variant={listing.path === s.path ? "secondary" : "outline"}
              size="sm"
              onClick={() => go(s.path)}
            >
              {s.name === "Home" ? <Home size={14} /> : <Folder size={14} />}
              {s.name}
            </Button>
          ))}
        </div>
      )}
      <div className="picker-location">
        <Button
          variant="outline"
          size="sm"
          disabled={!listing?.parent || busy}
          onClick={() => go(listing!.parent!)}
        >
          <ArrowUp size={14} /> Up
        </Button>
        <span className="picker-path" title={listing?.path}>
          <FolderOpen size={16} />
          {listing?.path ?? "Loading…"}
        </span>
        {busy && <Loader2 className="spin" size={16} />}
      </div>
      <div className="picker-list" role="list" aria-label="Folders">
        {listing && !listing.folders.length && (
          <p className="hint">
            No folders inside. You can choose this folder, or create a new one.
          </p>
        )}
        {listing?.folders.map((f) => (
          <button
            key={f.path}
            role="listitem"
            className="picker-folder"
            onClick={() => go(f.path)}
          >
            <Folder size={16} /> {f.name}
          </button>
        ))}
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="picker-footer">
        {newName === null ? (
          <Button
            variant="outline"
            disabled={!listing || busy}
            onClick={() => setNewName("")}
          >
            <FolderPlus size={15} /> New folder here
          </Button>
        ) : (
          <div className="row">
            <input
              autoFocus
              aria-label="New folder name"
              placeholder="e.g. ESG project"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") setNewName(null);
              }}
            />
            <Button
              variant="outline"
              onClick={create}
              disabled={!newName.trim()}
            >
              Create
            </Button>
          </div>
        )}
        <span className="spacer" />
        <Button onClick={choose} disabled={!listing || busy}>
          {confirm}: {listing?.name ?? "…"}
        </Button>
      </div>
    </Modal>
  );
}
