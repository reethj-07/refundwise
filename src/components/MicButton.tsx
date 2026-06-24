"use client";

import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MicButton({
  listening,
  onClick,
  disabled,
}: {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant={listening ? "danger" : "secondary"}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={listening ? "Stop listening" : "Speak your request"}
      aria-label={listening ? "Stop listening" : "Speak your request"}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
