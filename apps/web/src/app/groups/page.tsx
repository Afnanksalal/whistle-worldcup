import TournamentClient from "./TournamentClient";
import { getTournamentInitialData } from "../../lib/seo-data";

export const dynamic = "force-dynamic";

export default async function TournamentPage() {
  const initialData = await getTournamentInitialData();
  return <TournamentClient initialData={initialData} />;
}
