import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { ChampionPageClient } from "./ChampionPageClient";

interface ChampionEntry {
  key: string;
  name: string;
}

/** Champion list for static generation: the pipeline's output, or Data Dragon when it has not run yet. */
async function championList(): Promise<ChampionEntry[]> {
  try {
    const file = path.join(process.cwd(), "public", "data", "static", "en.json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Object.values(data.champions as Record<string, ChampionEntry>).map((c) => ({ key: c.key, name: c.name }));
  } catch {
    const versions: string[] = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then((r) => r.json());
    const json = await fetch(`https://ddragon.leagueoflegends.com/cdn/${versions[0]}/data/en_US/champion.json`).then((r) => r.json());
    return Object.values(json.data as Record<string, { id: string; name: string }>).map((c) => ({ key: c.id, name: c.name }));
  }
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await championList()).map((c) => ({ key: c.key }));
}

export async function generateMetadata({ params }: { params: { key: string } }): Promise<Metadata> {
  const champ = (await championList()).find((c) => c.key === params.key);
  const name = champ?.name ?? params.key;
  return {
    title: `${name} Pro Build`,
    description: `${name}: Challenger ve Grandmaster oyuncularının eşya dizilimleri, eşya geçmişi, rünleri ve yetenek sırası.`,
  };
}

export default function Page({ params }: { params: { key: string } }) {
  return <ChampionPageClient championKey={params.key} />;
}
