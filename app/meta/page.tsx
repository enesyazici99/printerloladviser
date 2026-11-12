import type { Metadata } from "next";
import { MetaPageClient } from "./MetaPageClient";

export const metadata: Metadata = {
  title: "Pro Meta",
  description: "Challenger ve Grandmaster maçlarında rol bazında seçilme ve kazanma oranları.",
};

export default function Page() {
  return <MetaPageClient />;
}
