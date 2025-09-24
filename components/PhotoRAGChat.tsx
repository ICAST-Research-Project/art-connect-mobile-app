/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useMuseumApi, type SearchFullResponse } from "@/lib/museumApi";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { CameraCapturedPicture } from "expo-camera";
import { router } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import VoiceRAGChat from "./VoiceRAGChat";

type Props = {
  photo: CameraCapturedPicture;
  onOpenCamera?: () => void;
  onMicPress?: () => void;
  onSendMessage?: (msg: string) => void;
  handleRetakePhoto?: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending?: boolean;
  channel?: "text" | "voice";
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

const SHEET_HEIGHT = Math.max(400, Math.floor(SCREEN_HEIGHT * 0.55));
const PEEK = 490;
const TRANSLATE_COLLAPSED = SHEET_HEIGHT - PEEK;

const TRANSLATE_EXPANDED = 0;
const TRANSLATE_MID = Math.floor(
  (TRANSLATE_COLLAPSED + TRANSLATE_EXPANDED) / 2
);

const SUGGESTIONS = [
  "What is the significance of this work?",
  "Materials & technique?",
  "Who is the artist?",
];

const PhotoRAGChat = ({
  photo,
  onOpenCamera,
  onSendMessage,
  handleRetakePhoto,
  onMicPress,
}: Props) => {
  const insets = useSafeAreaInsets();
  const openCamera = onOpenCamera ?? handleRetakePhoto;

  const [text, setText] = useState("");
  const [voiceVisible, setVoiceVisible] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);

  const translateY = useRef(new Animated.Value(TRANSLATE_COLLAPSED)).current;
  const dragStart = useRef(TRANSLATE_COLLAPSED);

  const [kbHeight, setKbHeight] = useState(0);
  const [kbVisible, setKbVisible] = useState(false);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const scrollViewRef = useRef<ScrollView>(null);

  const effectiveKb =
    Platform.OS === "ios"
      ? Math.max(kbHeight - (insets.bottom || 0), 0)
      : kbHeight;

  useEffect(() => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchFullResponse | null>(null);

  const { searchImageFromUri, postChat, postVoiceChatFromFile } =
    useMuseumApi();
  const [scanId, setScanId] = useState<string | null>(null);

  const pushAssistant = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `bot_${Date.now()}`, role: "assistant", text },
    ]);
  };

  const runSearch = useCallback(async () => {
    if (!photo?.uri) return;
    try {
      setLoading(true);
      setError(null);
      const resp = await searchImageFromUri(photo.uri, {
        top_k: 2,
        metric: "cosine",
      });
      setSearch(resp);
      setScanId(resp.scan_id ?? null);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [photo?.uri]);

  useEffect(() => {
    runSearch();
  }, [runSearch]);

  useEffect(() => {
    if (search && !loading) {
      Animated.spring(translateY, {
        toValue: TRANSLATE_MID,
        useNativeDriver: true,
        bounciness: 6,
      }).start(() => (dragStart.current = TRANSLATE_MID));
    }
  }, [search, loading, translateY]);

  useEffect(() => {
    const onShow = (e: any) => {
      setKbVisible(true);
      const h = e?.endCoordinates?.height ?? 0;
      setKbHeight(h);
      setKeyboardHeight(h);
      Animated.spring(translateY, {
        toValue: TRANSLATE_EXPANDED,
        useNativeDriver: true,
        bounciness: 6,
      }).start(() => (dragStart.current = TRANSLATE_EXPANDED));
    };

    const onHide = () => {
      setKbVisible(false);
      setKbHeight(0);
      setKeyboardHeight(0);
      Animated.spring(translateY, {
        toValue: TRANSLATE_COLLAPSED,
        useNativeDriver: true,
        bounciness: 6,
      }).start(() => (dragStart.current = TRANSLATE_COLLAPSED));
    };

    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      onShow
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      onHide
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [translateY]);

  const sheetBottom =
    Platform.OS === "ios" ? 0 : kbVisible ? keyboardHeight : 0;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !kbVisible,
        onMoveShouldSetPanResponder: () => !kbVisible,
        onPanResponderGrant: () => {
          translateY.stopAnimation((val: number) => (dragStart.current = val));
        },
        onPanResponderMove: (_, g) => {
          if (kbVisible) return;
          const next = dragStart.current + g.dy;
          const clamped = Math.max(
            TRANSLATE_EXPANDED,
            Math.min(TRANSLATE_COLLAPSED, next)
          );
          translateY.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          if (kbVisible) return;
          const current = dragStart.current + g.dy;
          const vy = g.vy;
          let target = TRANSLATE_COLLAPSED;
          if (vy < -0.8) target = TRANSLATE_EXPANDED;
          else if (vy > 0.8) target = TRANSLATE_COLLAPSED;
          else {
            const choices = [
              {
                t: TRANSLATE_EXPANDED,
                d: Math.abs(current - TRANSLATE_EXPANDED),
              },
              { t: TRANSLATE_MID, d: Math.abs(current - TRANSLATE_MID) },
              {
                t: TRANSLATE_COLLAPSED,
                d: Math.abs(current - TRANSLATE_COLLAPSED),
              },
            ];
            choices.sort((a, b) => a.d - b.d);
            target = choices[0].t;
          }
          Animated.spring(translateY, {
            toValue: target,
            useNativeDriver: true,
            bounciness: 6,
          }).start(() => (dragStart.current = target));
        },
      }),
    [translateY, kbVisible]
  );

  const handleSend = async (msg?: string) => {
    const toSend = (msg ?? text).trim();
    if (!toSend) return;

    onSendMessage?.(toSend);
    setText("");

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      text: toSend,
    };

    const pendingMsg: ChatMessage = {
      id: `bot_${Date.now()}`,
      role: "assistant",
      text: "",
      pending: true,
    };

    setMessages((prev) => [...prev, userMsg, pendingMsg]);

    Animated.spring(translateY, {
      toValue: TRANSLATE_MID,
      useNativeDriver: true,
      bounciness: 6,
    }).start(() => (dragStart.current = TRANSLATE_MID));

    if (!isMatch || !topResult) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? {
                ...m,
                pending: false,
                text: "Please scan the artwork first before asking a question.",
              }
            : m
        )
      );
      return;
    }

    if (!scanId) {
      setChatError("Missing scan id. Please rescan the artwork.");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, text: "Please rescan the artwork." }
            : m
        )
      );
      setChatLoading(false);
      return;
    }

    const topArtworkId = String(topResult.artwork_id);
    const maybeArtistId = topResult.artist_id ?? null;

    try {
      setChatLoading(true);
      setChatError(null);

      const resp = await postChat({
        question: toSend,
        scan_id: scanId,
        artwork_id: topArtworkId ?? undefined,
        artist_id: maybeArtistId ?? undefined,
        metric: "cosine",
        top_k: 6,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, text: resp.answer }
            : m
        )
      );
    } catch (e: any) {
      setChatError(e?.message ?? String(e));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, pending: false, text: "Sorry — I ran into a problem." }
            : m
        )
      );
    } finally {
      setChatLoading(false);
    }
  };

  const handleMicPress = () => {
    onMicPress?.();
    setVoiceVisible(true);
  };
  const handleVoiceClose = () => setVoiceVisible(false);

  const topResult = search?.results?.[0] ?? null;
  const isMatch = !!search?.decision?.is_match;
  const topArtistName = topResult?.artist_name ?? null;

  const bubbleText = loading
    ? "Analyzing your photo…"
    : error
    ? "Hmm, I couldn’t analyze that photo. Retake or tap Retry."
    : isMatch && topArtistName
    ? `This is an artwork by ${topArtistName}. What would you like to know more about it?`
    : search
    ? "I couldn’t identify this artwork. Please try scanning once more or we may do have information on this."
    : "What would you like to know about it?";

  const showChatControls = isMatch && !loading && !error;

  const bubbleMaxHeight = showChatControls
    ? SHEET_HEIGHT - 160
    : SHEET_HEIGHT - 120;

  const pushVoiceTurn = (transcript: string, answer: string) => {
    if (transcript?.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `user_voice_${Date.now()}`,
          role: "user",
          text: transcript.trim(),
          channel: "voice", // 👈 tag
        },
      ]);
    }
    if (answer?.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot_voice_${Date.now() + 1}`,
          role: "assistant",
          text: answer.trim(),
          channel: "voice", // 👈 tag
        },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["left", "right"]}>
      <View style={styles.photoLayer}>
        <Image
          style={styles.photo}
          source={{ uri: "data:image/jpg;base64," + photo.base64 }}
          resizeMode="cover"
        />

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingOverlayText}>Analyzing…</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            if (voiceVisible) {
              handleVoiceClose();
              return;
            }
            if (openCamera) openCamera();
            else router.replace("/camera");
          }}
        >
          <AntDesign name="close" size={32} color="white" />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: SHEET_HEIGHT,
            bottom: sheetBottom,
            transform: [{ translateY }],
          },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top || 0 : 0}
          style={{ flex: 1 }}
        >
          <View
            {...panResponder.panHandlers}
            style={styles.handleArea}
            hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
          >
            <View style={styles.handle} />
          </View>

          {voiceVisible ? (
            <VoiceRAGChat
              visible={voiceVisible}
              onClose={handleVoiceClose}
              onRecorded={(uri) => console.log("Recorded:", uri)}
              scanId={scanId!}
              artworkId={topResult ? String(topResult.artwork_id) : undefined}
              artistId={topResult?.artist_id ?? undefined}
              voiceId={undefined}
              bottomPadding={Math.max(insets.bottom, 8)}
              onVoiceTurn={(transcript, answer) => {
                pushVoiceTurn(transcript, answer);
              }}
            />
          ) : (
            <View style={styles.sheetInner}>
              {error && (
                <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ color: "red", marginBottom: 6 }}>
                    Error: {error}
                  </Text>
                  <TouchableOpacity
                    onPress={runSearch}
                    style={styles.retryButton}
                  >
                    <Text style={styles.retryText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}

              {search && !isMatch && (
                <View style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
                  <View style={styles.noMatchCard}>
                    <Text style={styles.noMatchTitle}>No Match Found!</Text>
                    {/* {search.decision.reason ? (
                    <Text style={styles.noMatchReason}>
                      Reason: {search.decision.reason}
                    </Text>
                  ) : null} */}

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        onPress={runSearch}
                        disabled={loading}
                        style={[
                          styles.outlineButton,
                          loading && { opacity: 0.6 },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="refresh"
                          size={16}
                          color="#1A73E8"
                        />
                        <Text style={styles.outlineButtonText}>Scan again</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          if (openCamera) openCamera();
                          else router.replace("/camera");
                        }}
                        style={styles.outlineButton}
                      >
                        <MaterialCommunityIcons
                          name="camera"
                          size={16}
                          color="#1A73E8"
                        />
                        <Text style={styles.outlineButtonText}>
                          Retake photo
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              <ScrollView
                ref={scrollViewRef}
                style={{ flexGrow: 0, maxHeight: bubbleMaxHeight }}
                contentContainerStyle={{
                  paddingBottom: 8,
                  paddingHorizontal: 8,
                }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {messages.length === 0 && (
                  <View style={styles.rowLeft}>
                    <MaterialCommunityIcons
                      name="robot-outline"
                      size={28}
                      color="black"
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.bubbleBot}>
                      {isMatch && topArtistName ? (
                        <Text style={styles.bubbleTextBot}>
                          This is an artwork by{" "}
                          <Text style={styles.bubbleStrong}>
                            {topArtistName}
                          </Text>
                          . What would you like to know more about it?
                        </Text>
                      ) : (
                        <Text style={styles.bubbleTextBot}>{bubbleText}</Text>
                      )}
                    </View>
                  </View>
                )}

                {messages.map((m) => {
                  if (m.role === "user") {
                    return (
                      <View key={m.id} style={styles.rowRight}>
                        <View style={styles.rightMsgContainer}>
                          {m.channel === "voice" ? (
                            <Text style={styles.tagVoiceUser}>Voice</Text>
                          ) : null}
                          <View style={styles.bubbleUser}>
                            <Text style={styles.bubbleTextUser}>{m.text}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  }

                  if (m.pending) {
                    return (
                      <View key={m.id} style={styles.rowLeft}>
                        <MaterialCommunityIcons
                          name="robot-outline"
                          size={28}
                          color="black"
                          style={{ marginTop: 2 }}
                        />
                        <View style={styles.leftMsgContainer}>
                          {m.channel === "voice" ? (
                            <Text style={styles.tagVoice}>Voice</Text>
                          ) : null}
                          <View style={styles.bubbleBot}>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <ActivityIndicator />
                              <Text style={styles.bubbleTextBot}>
                                Thinking…
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View key={m.id} style={styles.rowLeft}>
                      <MaterialCommunityIcons
                        name="robot-outline"
                        size={28}
                        color="black"
                        style={{ marginTop: 2 }}
                      />
                      <View style={styles.leftMsgContainer}>
                        {m.channel === "voice" ? (
                          <Text style={styles.tagVoice}>Voice</Text>
                        ) : null}
                        <View style={styles.bubbleBot}>
                          <Text style={styles.bubbleTextBot}>{m.text}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {showChatControls && (
                <ScrollView
                  horizontal
                  style={styles.suggestionsScroll}
                  contentContainerStyle={styles.suggestionsRow}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  fadingEdgeLength={Platform.OS === "android" ? 30 : 0}
                >
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => handleSend(s)}
                      style={styles.suggestion}
                      activeOpacity={0.85}
                      disabled={loading}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {showChatControls && (
                <View
                  style={[
                    styles.inputRow,
                    {
                      paddingBottom: kbVisible ? 8 : Math.max(insets.bottom, 8),
                    },
                  ]}
                >
                  <TextInput
                    placeholder="Ask anything"
                    placeholderTextColor="#9AA0A6"
                    value={text}
                    onChangeText={setText}
                    style={styles.input}
                    returnKeyType="send"
                    onSubmitEditing={() => handleSend()}
                    editable={!loading}
                    onFocus={() => {
                      Animated.spring(translateY, {
                        toValue: TRANSLATE_EXPANDED,
                        useNativeDriver: true,
                        bounciness: 6,
                      }).start(() => (dragStart.current = TRANSLATE_EXPANDED));
                    }}
                  />

                  <TouchableOpacity
                    onPress={handleMicPress}
                    activeOpacity={0.8}
                    style={[styles.iconButton, loading && { opacity: 0.5 }]}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="microphone" size={20} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handleSend()}
                    activeOpacity={0.8}
                    style={[
                      styles.sendButton,
                      (loading || chatLoading) && { opacity: 0.5 },
                    ]}
                    disabled={loading || chatLoading}
                  >
                    <AntDesign name="arrowup" size={16} color="white" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "black" },

  photoLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  photo: { width: "100%", height: "100%" },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadingOverlayText: {
    marginTop: 8,
    color: "white",
    fontWeight: "600",
  },

  sheetContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "white",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 10,
    zIndex: 5,
    overflow: "hidden",
  },
  handleArea: { paddingTop: 10, paddingBottom: 12, alignItems: "center" },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: "#DADCE0" },

  sheetInner: { paddingHorizontal: 12 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
  },
  bubble: {
    backgroundColor: "#F1F3F4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: "88%",
  },
  bubbleTextBot: {
    color: "#202124",
    fontSize: 14,
    textAlign: "justify",
    lineHeight: 20,
  },

  suggestionsScroll: { marginTop: 8, marginBottom: 6 },
  suggestionsRow: { paddingHorizontal: 8, alignItems: "center" },
  suggestion: {
    backgroundColor: "#F1F3F4",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  suggestionText: { color: "#202124", fontSize: 13, fontWeight: "600" },

  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#1A73E8",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  outlineButtonText: { color: "#1A73E8", fontWeight: "600" },

  noMatchCard: {
    backgroundColor: "#FFF3F0",
    borderRadius: 12,
    padding: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#FFD2C8",
  },
  noMatchTitle: { fontWeight: "700", fontSize: 16, textAlign: "center" },
  noMatchReason: { color: "#5F6368" },

  retryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#1A73E8",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: { color: "white", fontWeight: "600" },

  inputRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#F1F3F4",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#202124",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#1A73E8",
    alignItems: "center",
    justifyContent: "center",
  },

  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 4,
    borderRadius: 20,
    zIndex: 20,
  },
  bubbleStrong: {
    fontWeight: "bold",
    color: "#000",
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
    justifyContent: "flex-start",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
    justifyContent: "flex-end",
  },

  bubbleBot: {
    backgroundColor: "#F1F3F4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: "100%",
    alignSelf: "flex-start",
  },
  bubbleUser: {
    backgroundColor: "#1A73E8",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: "100%",
    alignSelf: "flex-end",
  },

  bubbleTextUser: { color: "white", fontSize: 14 },
  tagVoice: {
    alignSelf: "flex-start",
    fontSize: 10,
    fontWeight: "700",
    color: "#1A73E8",
    backgroundColor: "#E8F0FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  tagVoiceUser: {
    alignSelf: "flex-end",
    fontSize: 10,
    fontWeight: "700",
    color: "white",
    backgroundColor: "#174EA6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    opacity: 0.95,
  },
  leftMsgContainer: {
    flex: 1,
    flexShrink: 1,
    alignItems: "flex-start",
  },
  rightMsgContainer: {
    maxWidth: "85%",
    flexShrink: 1,
    alignItems: "flex-end",
  },
});

export default PhotoRAGChat;
