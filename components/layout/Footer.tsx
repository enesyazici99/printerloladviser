"use client";

import { useI18n } from "@/lib/i18n";
import { useMeta } from "@/lib/data";

export function Footer() {
  const { t, lang } = useI18n();
  const { data: meta } = useMeta();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-[1240px] space-y-1.5 px-3 py-6 text-xs leading-relaxed text-fg-muted sm:px-5">
        <p>
          {t("footer.source")}
          {meta && (
            <>
              {" "}
              {t("common.updated")}: {new Date(meta.generatedAt).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </>
          )}
        </p>
        <p>{t("footer.legal")}</p>
      </div>
    </footer>
  );
}
