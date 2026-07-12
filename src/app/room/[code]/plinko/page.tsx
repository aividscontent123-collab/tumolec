import { PlinkoScreen } from "@/components/room/PlinkoScreen";

export default async function PlinkoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PlinkoScreen roomCode={code} />;
}
