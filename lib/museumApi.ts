import { useAuth } from "@clerk/clerk-expo";

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://192.168.1.100:8000";

export type Neighbor = {
  rank: number;
  artwork_id: string | number;
  distance: number;
  similarity: number;
  artist_name?: string | null;
  artist_id?: string | null;
  artwork_title?: string | null;
};

export type SearchDecision = {
  is_match: boolean;
  sim_threshold: number;
  margin_threshold: number;
  top1_similarity: number | null;
  margin_vs_top2: number | null;
  reason: string | null;
};

export type SearchFullResponse = {
  query_dims: number;
  metric: "cosine" | "l2" | "ip";
  decision: SearchDecision;
  results: Neighbor[];
  scan_id?: string;
  artwork_image_url?: string | null;
};

export type SearchImageParams = Partial<{
  top_k: number;
  metric: "cosine" | "l2" | "ip";
  sim_threshold: number;
  margin_threshold: number;
  require_margin: boolean;
  solo_threshold: number;
  high_conf_threshold: number;
  margin_ratio_threshold: number;
}>;

export type SourceChunk = {
  source: "artwork" | "artist";
  source_id: string;
  content: string;
  distance: number;
  similarity: number;
  artist_name?: string | null;
  artwork_id?: string | null;
  artwork_title?: string | null;
};

export type ChatRequestPayload = {
  question: string;
  scan_id: string;
  artwork_id?: string | null;
  artist_id?: string | null;
  top_k?: number;
  metric?: "cosine" | "l2" | "ip";
  sim_threshold?: number;
};

export type ChatResponsePayload = {
  answer: string;
  sources: SourceChunk[];
};

export type VoiceChatRequestPayload = {
  prompt: string;
  scan_id: string;
  artwork_id?: string | null;
  artist_id?: string | null;
  voice_id?: string;
  voice?: string;
};

export type VoiceChatResponsePayload = {
  audio_b64: string;
  transcript?: string;
  answer_text?: string;
  sources?: SourceChunk[];
  mime?: string;
};

export function useMuseumApi() {
  const { getToken } = useAuth();

  // async function authHeaders(base?: HeadersInit) {
  //   const t = await getToken();
  //   return { ...(base || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
  // }
  async function authHeaders(
    base?: HeadersInit,
    opts?: { useAltHeader?: boolean }
  ) {
    const t = await getToken();
    const h: Record<string, string> = { ...(base as any) };
    if (t) {
      if (opts?.useAltHeader) {
        h["X-Client-Auth"] = `Bearer ${t}`; // <<— use this
      } else {
        h["Authorization"] = `Bearer ${t}`; // default path (kept for local/dev)
      }
    }
    return h;
  }

  async function searchImageFromUri(
    photoUri: string,
    params?: SearchImageParams
  ): Promise<SearchFullResponse> {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) qs.set(k, String(v));
      });
    }

    const form = new FormData();
    form.append("file", {
      uri: photoUri,
      name: `photo_${Date.now()}.jpg`,
      type: "image/jpeg",
    } as any);

    const res = await fetch(`${API_BASE_URL}/search-image?${qs.toString()}`, {
      method: "POST",
      headers: await authHeaders(undefined, { useAltHeader: true }),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    return (await res.json()) as SearchFullResponse;
  }

  /** Extract ?aid=... from a QR URL */
  function parseAidFromUrl(input: string): string | null {
    try {
      const u = new URL(input);
      return u.searchParams.get("aid");
    } catch {
      return null;
    }
  }

  /** Search by QR (GET /search-qr?aid=...) */
  async function searchQr(aid: string): Promise<SearchFullResponse> {
    const url = `${API_BASE_URL}/search-qr?aid=${encodeURIComponent(aid)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: await authHeaders(undefined, { useAltHeader: true }), // same auth style as image search
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`QR search failed: ${res.status} ${text}`);
    }
    return (await res.json()) as SearchFullResponse;
  }

  /** Convenience: call search-qr using the full QR URL string */
  async function searchQrFromUrl(qrUrl: string): Promise<SearchFullResponse> {
    const aid = parseAidFromUrl(qrUrl);
    if (!aid) throw new Error("QR URL missing 'aid' parameter");
    return searchQr(aid);
  }

  /** (Optional) One-shot helper: QR → search → start chat */
  async function startChatFromQrUrl(qrUrl: string, question?: string) {
    const resp = await searchQrFromUrl(qrUrl);
    const top = resp.results?.[0];
    return postChat({
      question: question ?? "Tell me about this artwork.",
      scan_id: resp.scan_id!, // FastAPI returns one in both image + QR flows
      artwork_id: top?.artwork_id?.toString(),
      artist_id: top?.artist_id ?? undefined,
      top_k: 6,
      metric: "cosine",
      sim_threshold: 0.3,
    });
  }

  async function postChat(
    payload: ChatRequestPayload
  ): Promise<ChatResponsePayload> {
    const res = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }), // ← token here
      body: JSON.stringify({ top_k: 6, metric: "cosine", ...payload }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Chat failed: ${res.status} ${text}`);
    }
    return (await res.json()) as ChatResponsePayload;
  }

  async function postVoiceChat(
    payload: VoiceChatRequestPayload
  ): Promise<VoiceChatResponsePayload> {
    const form = new FormData();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) form.append(k, String(v));
    });

    const res = await fetch(`${API_BASE_URL}/voice/chat`, {
      method: "POST",
      headers: await authHeaders(),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Voice chat failed: ${res.status} ${text}`);
    }
    return (await res.json()) as VoiceChatResponsePayload;
  }

  async function postVoiceChatFromFile(args: {
    audioUri: string;
    scan_id: string;
    artwork_id?: string | null;
    artist_id?: string | null;
    voice_id?: string | null;
    language_code?: string | null;
  }): Promise<VoiceChatResponsePayload> {
    const form = new FormData();

    form.append("scan_id", args.scan_id);
    if (args.artwork_id) form.append("artwork_id", args.artwork_id);
    if (args.artist_id) form.append("artist_id", args.artist_id);
    if (args.voice_id) form.append("voice_id", args.voice_id);
    if (args.language_code) form.append("language_code", args.language_code);

    form.append("audio_file", {
      uri: args.audioUri,
      name: `voice_${Date.now()}.m4a`,
      type: "audio/mp4",
    } as any);

    const res = await fetch(`${API_BASE_URL}/voice/chat`, {
      method: "POST",
      headers: await authHeaders(),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Voice chat failed: ${res.status} ${text}`);
    }
    return (await res.json()) as VoiceChatResponsePayload;
  }

  // return { searchImageFromUri, postChat, postVoiceChat, postVoiceChatFromFile };

  return {
    searchImageFromUri,
    searchQr,
    searchQrFromUrl,
    startChatFromQrUrl,
    postChat,
    postVoiceChat,
    postVoiceChatFromFile,
  };
}
