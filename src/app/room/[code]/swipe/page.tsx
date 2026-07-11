import { SwipeScreen } from "@/components/room/SwipeScreen";

export default async function SwipePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <SwipeScreen roomCode={code} />;
}
