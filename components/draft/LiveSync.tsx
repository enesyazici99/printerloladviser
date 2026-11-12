"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import type { DraftIndex } from "@/lib/draft/engine";
import { newestClientLog, parseSessionFromLog, readLogTail, sessionToBoard, type ChampSelectSession } from "@/lib/draft/session";
import { isTauri } from "@/lib/desktop/tauri";
import { useLCU } from "@/hooks/useLCU";
import { useDraft } from "@/stores/draft";

type Status = "idle" | "watching" | "live" | "none";
const POLL_MS = 2000;
const STALE_MS = 10 * 60 * 1000; // a log that has not been written for 10 minutes is not a live lobby

/**
 * Fills the board from the running League client.
 *  - Desktop app: the client's local API (through Tauri).
 *  - Browser: the client's log folder via the File System Access API (Chrome/Edge),
 *    or a single log file chosen by hand in other browsers.
 */
export function LiveSync({ index }: { index: DraftIndex | null }) {
  const { t } = useI18n();
  const applyBoard = useDraft((s) => s.applyBoard);
  const [status, setStatus] = useState<Status>("idle");
  const [canPickFolder, setCanPickFolder] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const dirRef = useRef<FileSystemDirectoryHandle | null>(null);
  const lastApplied = useRef("");
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    setCanPickFolder("showDirectoryPicker" in window);
    setDesktop(isTauri());
  }, []);

  /** Applies a session once; repeated identical sessions do not overwrite manual edits. */
  const applySession = useCallback(
    (session: ChampSelectSession) => {
      const signature = JSON.stringify([session.myTeam, session.theirTeam, session.bans, session.actions]);
      if (signature === lastApplied.current) return;
      lastApplied.current = signature;
      applyBoard(sessionToBoard(session, indexRef.current));
    },
    [applyBoard]
  );

  // Desktop app: sessions arrive from the local client API.
  const lcu = useLCU();
  useEffect(() => {
    if (lcu.champSelectSession) {
      applySession(lcu.champSelectSession as unknown as ChampSelectSession);
      setStatus("live");
    }
  }, [lcu.champSelectSession, applySession]);

  // Browser: poll the newest client log in the folder the user connected.
  useEffect(() => {
    if (status === "idle" || status === "none" || !dirRef.current) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const file = await newestClientLog(dirRef.current!);
        if (cancelled || !file) return;
        if (Date.now() - file.lastModified > STALE_MS) return setStatus("watching");
        const session = parseSessionFromLog(await readLogTail(file));
        if (cancelled) return;
        if (session) {
          applySession(session);
          setStatus("live");
        } else setStatus("watching");
      } catch {
        // permission revoked or folder gone: stop quietly
        if (!cancelled) {
          dirRef.current = null;
          setStatus("idle");
        }
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // status toggles between "watching" and "live" without needing a new interval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status === "idle" || status === "none", applySession]);

  const connect = async () => {
    try {
      // @ts-expect-error — File System Access API is not in the default DOM typings
      dirRef.current = await window.showDirectoryPicker({ id: "league-logs", mode: "read" });
      setStatus("watching");
    } catch {
      // user cancelled the folder dialog
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    dirRef.current = null;
    const session = parseSessionFromLog(await readLogTail(file, 4_000_000));
    if (session) {
      lastApplied.current = "";
      applySession(session);
      setStatus("live");
    } else setStatus("none");
  };

  const stop = () => {
    dirRef.current = null;
    setStatus("idle");
  };

  const dot = status === "live" ? "bg-win" : status === "watching" ? "bg-gold animate-pulse" : "bg-fg-muted";

  if (desktop) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-secondary" data-testid="live-sync">
        <span className={clsx("h-2 w-2 rounded-full", lcu.phase === "disconnected" ? "bg-fg-muted" : lcu.phase === "champ-select" ? "bg-win" : "bg-gold")} />
        {t(lcu.phase === "champ-select" ? "draft.sync.live" : "draft.sync.desktop")}
      </div>
    );
  }

  return (
    <div className="relative" data-testid="live-sync">
      <button type="button" className={clsx("btn", (status === "live" || status === "watching") && "btn-active")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={clsx("h-2 w-2 rounded-full", dot)} />
        {t("draft.sync")}
        <span className="chip bg-white/10 text-[10px] uppercase text-fg-muted">{t("draft.sync.beta")}</span>
      </button>
      {open && (
        <div className="panel absolute right-0 z-30 mt-2 w-[min(92vw,360px)] space-y-3 p-3 shadow-2xl" data-testid="live-sync-panel">
          <p className="text-xs leading-relaxed text-fg-secondary">{t("draft.sync.help")}</p>
          {status === "watching" && <p className="text-xs font-medium text-gold">{t("draft.sync.watching")}</p>}
          {status === "live" && (
            <p className="text-xs font-medium text-win" data-testid="sync-live">
              {t("draft.sync.live")}
            </p>
          )}
          {status === "none" && (
            <p className="text-xs font-medium text-loss" data-testid="sync-none">
              {t("draft.sync.noSession")}
            </p>
          )}
          {!canPickFolder && <p className="text-xs text-fg-muted">{t("draft.sync.unsupported")}</p>}
          <div className="flex flex-wrap gap-2">
            {canPickFolder && status !== "watching" && status !== "live" && (
              <button type="button" className="btn btn-primary" onClick={connect}>
                {t("draft.sync.connect")}
              </button>
            )}
            {(status === "watching" || (status === "live" && dirRef.current)) && (
              <button type="button" className="btn" onClick={stop}>
                {t("draft.sync.stop")}
              </button>
            )}
            <label className="btn cursor-pointer">
              {t("draft.sync.file")}
              <input type="file" accept=".log,.txt" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="log-file-input" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
