import { useAuth } from "@clerk/clerk-expo";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ChatItem = {
  scan_id: string;
  scan_title?: string | null;
  artwork_title?: string | null;
  artwork_image_url?: string | null;
  last_message_at?: string | null;
  created_at: string;
};

const API = process.env.EXPO_PUBLIC_API_BASE_URL;

/** Convert path-style S3 URLs → virtual-hosted and encode key safely */
function normalizeS3Url(url?: string | null) {
  if (!url) return undefined;

  const pathStyle = url.match(
    /^https:\/\/s3[.-]([^.]+)\.amazonaws\.com\/([^/]+)\/(.+)$/
  );
  if (pathStyle) {
    const [, region, bucket, key] = pathStyle;
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
  }

  const vhost = url.match(
    /^https:\/\/([^/]+)\.s3[.-]([^.]+)\.amazonaws\.com\/(.+)$/
  );
  if (vhost) {
    const [, bucket, region, key] = vhost;
    return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURI(key)}`;
  }

  return url;
}

const dtf = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatWhen(ts?: string | null) {
  if (!ts) return "";
  try {
    return dtf.format(new Date(ts));
  } catch {
    return "";
  }
}

const ChatRow = memo(({ item }: { item: ChatItem }) => {
  const title = item.scan_title || item.artwork_title || "Untitled";
  const when = formatWhen(item.last_message_at || item.created_at);
  const uri = normalizeS3Url(item.artwork_image_url);

  return (
    <TouchableOpacity
      className="mx-4 my-2"
      activeOpacity={0.88}
      onPress={() =>
        router.push({ pathname: "/chat/[id]", params: { id: item.scan_id } })
      }
    >
      <View
        className="flex-row items-center p-3  bg-white border border-gray-100"
        style={{
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 2,
        }}
      >
        <View className="mr-4">
          {uri ? (
            <Image
              source={{ uri }}
              style={{
                width: 96,
                height: 96,
                borderRadius: 0,
                backgroundColor: "#EEE",
              }}
              contentFit="cover"
              transition={150}
              cachePolicy="memory-disk"
              priority="high"
              recyclingKey={uri}
              onError={(err) => {
                console.log("image error:", uri, err);
              }}
            />
          ) : (
            <View className="w-24 h-24 bg-gray-200 items-center justify-center">
              <Text className="text-gray-500">🖼️</Text>
            </View>
          )}
        </View>

        <View className="flex-1 p-2">
          <Text className="text-xs uppercase tracking-wide text-gray-500">
            Artwork Title:
          </Text>
          <Text className="font-semibold text-xl mt-0.5" numberOfLines={1}>
            {title}
          </Text>

          <Text className="text-base text-gray-500 mt-2" numberOfLines={1}>
            {when}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
ChatRow.displayName = "ChatRow";

export default function ChatHistory() {
  const { getToken, isSignedIn } = useAuth();
  const [rows, setRows] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  const fetchPage = useCallback(
    async (pageOffset: number) => {
      if (!API) throw new Error("EXPO_PUBLIC_API_BASE_URL is not set.");
      if (!isSignedIn) throw new Error("Not signed in.");
      const token = await getToken();
      if (!token) throw new Error("Missing Clerk token.");

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const url = `${API}/chat/history?limit=25&offset=${pageOffset}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${txt}`);
        }
        const data: ChatItem[] = await res.json();

        const normalized = data.map((d) => ({
          ...d,
          artwork_image_url: normalizeS3Url(d.artwork_image_url),
        }));
        return normalized;
      } finally {
        clearTimeout(timer);
      }
    },
    [API, getToken, isSignedIn]
  );

  const load = useCallback(
    async (append = false) => {
      if (loadingRef.current || (append && !hasMoreRef.current)) return;
      setLoading(true);
      setErr(null);
      try {
        const pageOffset = append ? offsetRef.current : 0;
        const data = await fetchPage(pageOffset);
        setRows((prev) => (append ? [...prev, ...data] : data));
        setOffset((prev) => (append ? prev + data.length : data.length));
        setHasMore(data.length === 25);
      } catch (e: any) {
        const msg = e?.message || String(e);
        const friendly =
          msg.includes("Network request failed") || msg.includes("TypeError")
            ? "Cannot reach API. Check tunnel/URL (HTTPS) or network."
            : msg;
        setErr(friendly);
      } finally {
        setLoading(false);
      }
    },
    [fetchPage]
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }, [load]);

  return (
    <View className="flex-1 bg-[#F7F7F8]">
      <View className="px-4  pb-3">
        <Text className="text-2xl font-extrabold">Artwork Chats</Text>
      </View>

      {(!API || (loading && rows.length === 0)) && (
        <View className="py-10 items-center">
          {!API ? (
            <Text className="text-red-600 px-4 text-center">
              Missing EXPO_PUBLIC_API_BASE_URL. Set it and restart Expo.
            </Text>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      )}

      {err && rows.length === 0 && (
        <Text className="text-red-600 px-4">{err}</Text>
      )}

      {!err && rows.length === 0 && !loading && API && (
        <Text className="text-gray-500 px-4">No chats yet.</Text>
      )}

      {rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.scan_id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!loadingRef.current && hasMoreRef.current) load(true);
          }}
          renderItem={({ item }) => <ChatRow item={item} />}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListFooterComponent={
            loading ? (
              <View className="py-3">
                <ActivityIndicator />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
