import { WheelScreen } from "@/components/room/WheelScreen";

export default async function WheelPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <WheelScreen roomCode={code} />;
}
