import { VersusScreen } from "@/components/room/VersusScreen";

export default async function VersusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <VersusScreen roomCode={code} />;
}
