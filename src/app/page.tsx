import { SignalIndex } from "@/components/SignalIndex";
import { getSearchIndex } from "@/data/repository";

export const revalidate = 86400;

export default async function HomePage() {
  const entries = await getSearchIndex();
  return <SignalIndex entries={entries} />;
}
