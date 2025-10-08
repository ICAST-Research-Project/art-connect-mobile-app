import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Msg = {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  channel?: string | null;
  created_at: string;
};

const API =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_URL;

const PAGE_SIZE = 50;

function formatHM(ts?: string) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const VoiceTag = ({ side }: { side: "left" | "right" }) => (
  <View
    className={
      side === "right"
        ? "mb-1 px-2.5 py-1 rounded-full bg-[#174EA6] border border-[#174EA6]"
        : "mb-1 px-2.5 py-1 rounded-full bg-[#E8F0FE] border border-[#D2E3FC]"
    }
  >
    <Text
      className={
        side === "right"
          ? "text-white text-[10px] font-bold tracking-wider"
          : "text-[#1A73E8] text-[10px] font-bold tracking-wider"
      }
    >
      Audio
    </Text>
  </View>
);

export default function ChatDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);

  const earliestISO = msgs.length ? msgs[0].created_at : undefined;

  const fetchPage = useCallback(
    async (before?: string) => {
      if (!API) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");
      const token = await getToken();
      if (!token) throw new Error("Missing Clerk token");

      const url = new URL(`${API}/chat/${id}/messages`);
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (before) url.searchParams.set("before", before);

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${txt}`);
      }
      const data: Msg[] = await res.json();
      return data;
    },
    [API, getToken, id]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const page = await fetchPage();
        if (!mounted) return;
        setMsgs(page);
        setHasOlder(page.length === PAGE_SIZE);
      } catch (e: any) {
        if (!mounted) return;
        setErr(e?.message || "Failed to load messages");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [fetchPage]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const latest = await fetchPage();
      setMsgs(latest);
      setHasOlder(latest.length === PAGE_SIZE);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message || "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || !earliestISO) return;
    try {
      setLoadingOlder(true);
      const older = await fetchPage(earliestISO);
      const seen = new Set(msgs.map((m) => m.id));
      const unique = older.filter((m) => !seen.has(m.id));
      setMsgs((prev) => [...unique, ...prev]);
      setHasOlder(older.length === PAGE_SIZE);
    } finally {
      setLoadingOlder(false);
    }
  }, [earliestISO, fetchPage, hasOlder, loadingOlder, msgs]);

  const renderItem = useCallback(({ item }: { item: Msg }) => {
    const isUser = item.sender === "user";
    const isVoice = !!item.channel && item.channel !== "text";

    return (
      <View
        className={
          isUser ? "self-end items-end mb-2" : "self-start items-start mb-2"
        }
      >
        {isVoice && <VoiceTag side={isUser ? "right" : "left"} />}

        <View
          className={[
            "max-w-[85%] px-3 py-2 rounded-2xl",
            isUser ? "bg-blue-600" : "bg-gray-200",
          ].join(" ")}
        >
          <Text className={isUser ? "text-white" : "text-black"}>
            {item.content}
          </Text>
          <Text
            className={
              isUser
                ? "text-white/80 text-[10px] mt-1"
                : "text-gray-600 text-[10px] mt-1"
            }
          >
            {formatHM(item.created_at)}
          </Text>
        </View>
      </View>
    );
  }, []);

  if (!API) {
    return (
      <SafeAreaView
        className="flex-1 bg-white items-center justify-center px-4"
        edges={["left", "right"]}
      >
        <Text className="text-red-600 text-center">
          Missing EXPO_PUBLIC_API_BASE_URL. Set it and restart the app.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["left", "right"]}>
      <View className="px-4 pb-3 border-b border-gray-200 bg-white flex-row items-center">
        <TouchableOpacity
          onPress={() => router.replace("/profile")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mr-2"
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#1A73E8" />
        </TouchableOpacity>

        <View className="flex-1">
          <Text className="text-xl mt-3 font-bold">Conversation</Text>
          <Text className="text-xs text-gray-500 mt-0.5">Chat history</Text>
        </View>
      </View>

      {loading && msgs.length === 0 ? (
        <View className="py-6 items-center">
          <ActivityIndicator />
        </View>
      ) : err ? (
        <View className="p-4">
          <Text className="text-red-600">{err}</Text>
        </View>
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: 16,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            hasOlder ? (
              <View className="py-2 items-center">
                <TouchableOpacity
                  onPress={loadOlder}
                  disabled={loadingOlder}
                  className="px-3 py-1.5 rounded-full border border-gray-300"
                  activeOpacity={0.8}
                >
                  {loadingOlder ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator />
                      <Text className="text-gray-600">Loading earlier…</Text>
                    </View>
                  ) : (
                    <Text className="text-gray-700 font-medium">
                      Load earlier messages
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <Text className="text-gray-500">No messages yet.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
