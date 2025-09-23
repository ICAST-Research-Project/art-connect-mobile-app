// const API_BASE_URL =
//   process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://192.168.1.100:8000";

// export type Neighbor = {
//   rank: number;
//   artwork_id: string | number;
//   distance: number;
//   similarity: number;
//   artist_name?: string | null;
//   artist_id?: string | null;
// };

// export type SearchDecision = {
//   is_match: boolean;
//   sim_threshold: number;
//   margin_threshold: number;
//   top1_similarity: number | null;
//   margin_vs_top2: number | null;
//   reason: string | null;
// };

// export type SearchFullResponse = {
//   query_dims: number;
//   metric: "cosine" | "l2" | "ip";
//   decision: SearchDecision;
//   results: Neighbor[];
// };

// export type SearchImageParams = Partial<{
//   top_k: number;
//   metric: "cosine" | "l2" | "ip";
//   sim_threshold: number;
//   margin_threshold: number;
//   require_margin: boolean;
//   solo_threshold: number;
//   high_conf_threshold: number;
//   margin_ratio_threshold: number;
// }>;

// export async function searchImageFromUri(
//   photoUri: string,
//   params?: SearchImageParams
// ): Promise<SearchFullResponse> {
//   const qs = new URLSearchParams();
//   if (params) {
//     Object.entries(params).forEach(([k, v]) => {
//       if (v !== undefined && v !== null) qs.set(k, String(v));
//     });
//   }

//   const form = new FormData();

//   form.append("file", {
//     uri: photoUri,
//     name: `photo_${Date.now()}.jpg`,
//     type: "image/jpeg",
//   } as any);

//   const res = await fetch(`${API_BASE_URL}/search-image?${qs.toString()}`, {
//     method: "POST",
//     body: form,
//   });

//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     throw new Error(`Search failed: ${res.status} ${text}`);
//   }

//   return (await res.json()) as SearchFullResponse;
// }

// export type SourceChunk = {
//   source: "artwork" | "artist";
//   source_id: string;
//   content: string;
//   distance: number;
//   similarity: number;
//   artist_name?: string | null;
//   artwork_id?: string | null;
//   artwork_title?: string | null;
// };

// export type ChatRequestPayload = {
//   question: string;
//   artwork_id?: string | null;
//   artist_id?: string | null;
//   top_k?: number;
//   metric?: "cosine" | "l2" | "ip";
//   sim_threshold?: number;
// };

// export type ChatResponsePayload = {
//   answer: string;
//   sources: SourceChunk[];
// };

// export async function postChat(
//   payload: ChatRequestPayload
// ): Promise<ChatResponsePayload> {
//   const res = await fetch(`${API_BASE_URL}/chat`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ top_k: 6, metric: "cosine", ...payload }),
//   });
//   if (!res.ok) {
//     const text = await res.text().catch(() => "");
//     throw new Error(`Chat failed: ${res.status} ${text}`);
//   }
//   return (await res.json()) as ChatResponsePayload;
// }

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

// Add near your other types
export type VoiceChatRequestPayload = {
  prompt: string; // the user's transcribed text
  scan_id: string; // required (from search)
  artwork_id?: string | null;
  artist_id?: string | null;
  voice_id?: string;
  voice?: string; // optional: backend voice id/nickname if supported
};

export type VoiceChatResponsePayload = {
  audio_b64: string; // base64-encoded audio (mp3)
  answer?: string; // backend may also return the text answer
  sources?: SourceChunk[];
  mime?: string; // e.g. "audio/mpeg"
};

export function useMuseumApi() {
  const { getToken } = useAuth();

  async function authHeaders(base?: HeadersInit) {
    const t = await getToken();
    return { ...(base || {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) };
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
      headers: await authHeaders(),
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Search failed: ${res.status} ${text}`);
    }
    return (await res.json()) as SearchFullResponse;
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

  // Inside useMuseumApi()
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

  return { searchImageFromUri, postChat, postVoiceChat };
}
