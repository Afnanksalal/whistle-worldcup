import NewsClient from "./NewsClient";
import { getNewsInitialData } from "../../lib/seo-data";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const initialData = await getNewsInitialData();
  return <NewsClient initialData={initialData} />;
}
