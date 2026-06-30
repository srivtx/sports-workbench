// SSE (Server-Sent Events) client built on raw fetch + ReadableStream so we
// can pass custom headers (Authorization, X-Api-Token, Last-Event-ID).

export interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

export interface SseOptions {
  url: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  onError?: (err: Error) => void;
}

export async function* sseStream(opts: SseOptions): AsyncGenerator<SseEvent> {
  let res: Response;
  try {
    res = await fetch(opts.url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
        ...(opts.headers ?? {}),
      },
      signal: opts.signal,
    });
  } catch (e: any) {
    // Surface a helpful error for the common DNS/network failure
    const cause = e?.cause as { code?: string; hostname?: string } | undefined;
    if (cause?.code === "ENOTFOUND" || /ENOTFOUND/.test(String(e?.message))) {
      throw new Error(
        `Cannot resolve host ${cause?.hostname ?? opts.url}. ` +
          `If you are using the free World Cup tier, the guest subdomain ` +
          `(e.g. oracle.txodds.com) may not be in public DNS from your network. ` +
          `Try the paid tier at txline.txodds.com or run from a host with DNS access.`
      );
    }
    throw new Error(`SSE connection failed: ${e?.message ?? e}`);
  }

  if (!res.ok || !res.body) {
    throw new Error(`SSE failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let data = "";
  let event: string | undefined;
  let id: string | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, "");
        buffer = buffer.slice(idx + 1);
        if (line === "") {
          // dispatch
          if (data) {
            yield { id, event, data: data.replace(/\n$/, "") };
          }
          data = "";
          event = undefined;
          id = undefined;
          continue;
        }
        if (line.startsWith(":")) continue; // comment
        if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim() + "\n";
        else {
          // unknown field — ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
