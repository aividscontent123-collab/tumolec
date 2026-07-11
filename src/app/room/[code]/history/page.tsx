import { HistoryScreen } from "@/components/room/HistoryScreen";

export default async function HistoryPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <HistoryScreen roomCode={code} />;
}
