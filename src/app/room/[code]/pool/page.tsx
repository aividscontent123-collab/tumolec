import { GamePoolScreen } from "@/components/room/GamePoolScreen";

export default async function PoolPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GamePoolScreen roomCode={code} />;
}
