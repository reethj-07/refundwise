import { Header } from "@/components/Header";
import { ConversationDetail } from "@/components/ConversationDetail";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <>
      <Header active="admin" />
      <ConversationDetail id={conversationId} />
    </>
  );
}
