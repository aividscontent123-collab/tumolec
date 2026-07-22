import { StatsScreen } from "@/components/room/StatsScreen";

export default async function StatsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <StatsScreen roomCode={code} />;
}
