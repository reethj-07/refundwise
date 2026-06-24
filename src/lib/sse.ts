// Server-Sent Events helpers.

export function sseData(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function sseComment(text: string): string {
  return `: ${text}\n\n`;
}

export const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx / some CDNs) so events flush immediately.
  "X-Accel-Buffering": "no",
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
