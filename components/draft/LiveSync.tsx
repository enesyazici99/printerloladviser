"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useI18n } from "@/lib/i18n";
import type { DraftIndex } from "@/lib/draft/engine";
import { findClientLog, readLogTail, readSessionFromLog, sessionToBoard, type ChampSelectSession, type LogDirectory } from "@/lib/draft/session";
import { isTauri } from "@/lib/desktop/tauri";
import { useLCU } from "@/hooks/useLCU";
import { useDraft } from "@/stores/draft";

/**
 * idle      nothing connected
 * watching  a log is being read, no champion select is going on in it
 * live      the board follows a champion select
 * old       the last champion select is over; its draft was loaded onto the board
 * none      a hand-picked file without any champion select
 * nolog     the connected folder has no client log
 * error     the folder or file could not be read
 */
type Status = "idle" | "watching" | "live" | "old" | "none" | "nolog" | "error";
const POLL_MS = 2000;
/** A champion select writes an update at least every pick/ban turn; after this long without one it is over. */
const ACTIVE_SECONDS = 150;
/** A lobby that ended less than this long ago is most likely the game being played right now. */
const RECENT_SECONDS = 50 * 60;
const STALE_MS = 15 * 60 * 1000; // a log nobody has written to for this long belongs to a closed client

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
  const [detail, setDetail] = useState(""); // file being read, or the error text
  const [canPickFolder, setCanPickFolder] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const dirRef = useRef<LogDirectory | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const lastApplied = useRef("");
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => {
    setCanPickFolder("showDirectoryPicker" in window);
    setDesktop(isTauri());
  }, []);

  // The panel floats over the page: clicking anywhere else puts it away (syncing continues).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

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
    if (!connected) return;
    let cancelled = false;
    const tick = async () => {
      const dir = dirRef.current;
      if (!dir) return;
      try {
        const file = await findClientLog(dir);
        if (cancelled) return;
        if (!file) return setStatus("nolog");
        setDetail(file.name);
        if (Date.now() - file.lastModified > STALE_MS) return setStatus("watching");
        const found = readSessionFromLog(await readLogTail(file));
        if (cancelled) return;
        if (found && (found.age == null || found.age <= ACTIVE_SECONDS)) {
          applySession(found.session);
          setStatus("live");
        } else if (found && found.age != null && found.age <= RECENT_SECONDS) {
          // The lobby just ended (loading screen or in game): its draft is still what the
          // player wants build advice for, so show it once and keep waiting for the next one.
          applySession(found.session);
          setStatus("old");
        } else setStatus("watching");
      } catch (err) {
        // Permission withdrawn, folder removed, file unreadable: say so instead of silently stopping.
        if (cancelled) return;
        dirRef.current = null;
        setConnected(false);
        setDetail(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected, applySession]);

  const connect = async () => {
    try {
      // Called on `window` itself: the browser rejects the function when it is detached from it.
      dirRef.current = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<LogDirectory> }).showDirectoryPicker({ id: "league-logs", mode: "read" });
      lastApplied.current = "";
      setDetail("");
      setStatus("watching");
      setConnected(true);
    } catch (err) {
      // Closing the dialog is not an error; anything else (e.g. a folder the browser refuses) is shown.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setDetail(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    dirRef.current = null;
    setConnected(false);
    setDetail(file.name);
    try {
      const found = readSessionFromLog(await readLogTail(file, 4_000_000));
      if (!found) return setStatus("none");
      lastApplied.current = "";
      applySession(found.session);
      setStatus(found.age != null && found.age > ACTIVE_SECONDS ? "old" : "live");
    } catch (err) {
      setDetail(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const stop = () => {
    dirRef.current = null;
    setConnected(false);
    setDetail("");
    setStatus("idle");
  };

  const dot = status === "live" ? "bg-win" : status === "watching" || (status === "old" && connected) ? "bg-gold animate-pulse" : status === "error" || status === "nolog" ? "bg-loss" : "bg-fg-muted";

  if (desktop) {
    return (
      <div className="flex items-center gap-2 text-xs text-fg-secondary" data-testid="live-sync">
        <span className={clsx("h-2 w-2 rounded-full", lcu.phase === "disconnected" ? "bg-fg-muted" : lcu.phase === "champ-select" ? "bg-win" : "bg-gold")} />
        {t(lcu.phase === "champ-select" ? "draft.sync.live" : "draft.sync.desktop")}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative" data-testid="live-sync">
      <button type="button" className={clsx("btn", connected && "btn-active")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={clsx("h-2 w-2 rounded-full", dot)} />
        {t("draft.sync")}
        <span className="chip bg-white/10 text-[10px] uppercase text-fg-muted">{t("draft.sync.beta")}</span>
      </button>
      {open && (
        <div className="panel absolute right-0 z-30 mt-2 w-[min(92vw,380px)] space-y-3 p-3 shadow-2xl" data-testid="live-sync-panel">
          <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-fg-secondary">
            <li>{t("draft.sync.step1")}</li>
            <li>{t("draft.sync.step2")}</li>
            <li>{t("draft.sync.step3")}</li>
          </ol>
          <p className="text-[11px] leading-relaxed text-fg-muted">{t("draft.sync.privacy")}</p>

          {status === "watching" && <p className="text-xs font-medium text-gold">{t("draft.sync.watching")}</p>}
          {status === "live" && (
            <p className="text-xs font-medium text-win" data-testid="sync-live">
              {t("draft.sync.live")}
            </p>
          )}
          {status === "old" && (
            <p className="text-xs font-medium text-gold" data-testid="sync-old">
              {t("draft.sync.old")}
            </p>
          )}
          {status === "none" && (
            <p className="text-xs font-medium text-loss" data-testid="sync-none">
              {t("draft.sync.noSession")}
            </p>
          )}
          {status === "nolog" && (
            <p className="text-xs font-medium text-loss" data-testid="sync-nolog">
              {t("draft.sync.noLog")}
            </p>
          )}
          {status === "error" && (
            <p className="text-xs font-medium text-loss" data-testid="sync-error">
              {t("draft.sync.error")} {detail}
            </p>
          )}
          {detail && status !== "error" && status !== "idle" && (
            <p className="truncate text-[11px] text-fg-muted" title={detail} data-testid="sync-file">
              {detail}
            </p>
          )}
          {!canPickFolder && <p className="text-xs text-fg-muted">{t("draft.sync.unsupported")}</p>}

          <div className="flex flex-wrap gap-2">
            {canPickFolder && !connected && (
              <button type="button" className="btn btn-primary" onClick={connect}>
                {t("draft.sync.connect")}
              </button>
            )}
            {connected && (
              <button type="button" className="btn" onClick={stop}>
                {t("draft.sync.stop")}
              </button>
            )}
            <label className="btn cursor-pointer">
              {t("draft.sync.file")}
              <input
                type="file"
                accept=".log,.txt"
                className="sr-only"
                onChange={(e) => {
                  onFile(e.target.files?.[0]);
                  e.target.value = ""; // choosing the same file again should read it again
                }}
                data-testid="log-file-input"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
