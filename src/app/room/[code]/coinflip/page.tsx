import { CoinflipScreen } from "@/components/room/CoinflipScreen";

export default async function CoinflipPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CoinflipScreen roomCode={code} />;
}
