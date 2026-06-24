import { Header } from "@/components/Header";
import { ChatPanel } from "@/components/ChatPanel";

export default function ChatPage() {
  return (
    <>
      <Header active="chat" />
      <ChatPanel />
    </>
  );
}
