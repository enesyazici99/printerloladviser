import type { Metadata } from "next";
import { DraftPageClient } from "./DraftPageClient";

export const metadata: Metadata = {
  title: "Draft Asistanı",
  description: "Şampiyon seçiminde takımına ve rakibe göre en iyi seçimler, ban önerileri ve maça özel build — yalnızca Challenger/Grandmaster verisiyle.",
};

export default function Page() {
  return <DraftPageClient />;
}
