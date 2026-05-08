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
  Image,
  Keyboard,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import VoiceRAGChat from "./VoiceRAGChat";

type PhotoLike = Pick<CameraCapturedPicture, "uri" | "base64"> &
  Partial<CameraCapturedPicture>;

type Props = {
  // photo: CameraCapturedPicture;
  photo: PhotoLike;
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

const SUGGESTIONS = [
  "What is the significance of this work?",
  "Materials & technique?",
  "Who is the artist?",
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getTouchDistance = (touches: { pageX: number; pageY: number }[]) => {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

const MIN_PHOTO_SCALE = 1;
const MAX_PHOTO_SCALE = 4;
const PHOTO_RESET_THRESHOLD = 0.04;

const PhotoRAGChat = ({
  photo,
  onOpenCamera,
  onSendMessage,
  handleRetakePhoto,
  onMicPress,
}: Props) => {
  const insets = useSafeAreaInsets();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const openCamera = onOpenCamera ?? handleRetakePhoto;

  const [text, setText] = useState("");
  const [voiceVisible, setVoiceVisible] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);

  const [retrying, setRetrying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchFullResponse | null>(null);

  // --- Dynamic sheet geometry based on whether conversation exists ---
  const hasConversation = messages.length > 0;
  const activeMode = hasConversation || voiceVisible;
  const topResult = search?.results?.[0] ?? null;
  const isMatch = !!search?.decision?.is_match;
  const topArtistName = topResult?.artist_name ?? null;
  const showChatControls = isMatch && !loading && !error && !voiceVisible;

  const SHEET_MAX_HEIGHT = Math.floor(screenHeight * 0.8);
  const BASE_MIN = Math.floor(screenHeight * 0.22);
  const [footerH, setFooterH] = useState(0);
  const [inactiveContentH, setInactiveContentH] = useState(0);
  const footerOffset = showChatControls ? footerH : 0;
  const sheetMaxHeight = Math.max(180, SHEET_MAX_HEIGHT - footerOffset);

  const sheetHeight = useMemo(() => {
    if (activeMode) return sheetMaxHeight;

    const fallbackInactiveHeight = Math.min(
      Math.max(140, BASE_MIN),
      sheetMaxHeight
    );

    return inactiveContentH
      ? Math.min(Math.ceil(inactiveContentH), sheetMaxHeight)
      : fallbackInactiveHeight;
  }, [activeMode, BASE_MIN, inactiveContentH, sheetMaxHeight]);

  const peekVisible = useMemo(() => {
    if (!activeMode) return sheetHeight;

    const activePeek = 120;

    return Math.min(activePeek, sheetHeight);
  }, [activeMode, sheetHeight]);

  const TRANSLATE_EXPANDED = 0;
  const TRANSLATE_COLLAPSED = sheetHeight - peekVisible;
  const TRANSLATE_MID = Math.floor(
    (TRANSLATE_COLLAPSED + TRANSLATE_EXPANDED) / 2
  );

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
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 80);

    return () => clearTimeout(timeout);
  }, [footerH, messages]);

  useEffect(() => {
    const target = hasConversation ? TRANSLATE_EXPANDED : TRANSLATE_COLLAPSED;
    Animated.spring(translateY, {
      toValue: target,
      useNativeDriver: true,
      bounciness: 6,
    }).start(() => (dragStart.current = target));
  }, [sheetHeight, peekVisible, hasConversation, TRANSLATE_EXPANDED]);

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
      // setError(e?.message ?? String(e));
      const msg = e?.message ?? String(e);
      if (/HTTP\s(5\d{2}|429|425)/.test(msg)) {
        setRetrying(true); // “service warming up” hint
      }
      setError(msg);
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
        toValue: hasConversation ? TRANSLATE_EXPANDED : TRANSLATE_COLLAPSED,
        useNativeDriver: true,
        bounciness: 6,
      }).start(
        () =>
          (dragStart.current = hasConversation
            ? TRANSLATE_EXPANDED
            : TRANSLATE_COLLAPSED)
      );
    }
  }, [
    search,
    loading,
    hasConversation,
    TRANSLATE_EXPANDED,
    TRANSLATE_COLLAPSED,
    translateY,
  ]);

  useEffect(() => {
    // reset conversation state when a new image comes in
    setMessages([]);
    setText("");
    setVoiceVisible(false);
    setChatError(null);
    setSearch(null);
    setScanId(null);
    setRetrying(false);
  }, [photo?.uri]);

  // Expand when voice UI opens; collapse appropriately when it closes
  useEffect(() => {
    const target = voiceVisible
      ? TRANSLATE_EXPANDED
      : hasConversation
      ? TRANSLATE_EXPANDED
      : TRANSLATE_COLLAPSED;

    Animated.spring(translateY, {
      toValue: target,
      useNativeDriver: true,
      bounciness: 6,
    }).start(() => (dragStart.current = target));
  }, [
    voiceVisible,
    hasConversation,
    TRANSLATE_EXPANDED,
    TRANSLATE_COLLAPSED,
  ]);

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
      const targetPosition = hasConversation
        ? TRANSLATE_EXPANDED
        : TRANSLATE_COLLAPSED;
      Animated.spring(translateY, {
        toValue: targetPosition,
        useNativeDriver: true,
        bounciness: 6,
      }).start(() => (dragStart.current = targetPosition));
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
  }, [translateY, hasConversation]);

  const KB_EXTRA_LIFT = 22;

  const sheetBottom = kbVisible
    ? Platform.OS === "ios"
      ? keyboardHeight - (insets.bottom || 0) + KB_EXTRA_LIFT
      : keyboardHeight + KB_EXTRA_LIFT
    : 0;

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

          const low = Math.min(TRANSLATE_EXPANDED, TRANSLATE_COLLAPSED);
          const high = Math.max(TRANSLATE_EXPANDED, TRANSLATE_COLLAPSED);
          const clamped = Math.max(low, Math.min(high, next));
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
    [
      translateY,
      kbVisible,
      TRANSLATE_EXPANDED,
      TRANSLATE_COLLAPSED,
      TRANSLATE_MID,
    ]
  );

  const bubbleText = loading
    ? "Analyzing your photo…"
    : error
    ? "Hmm, I couldn’t analyze that photo. Retake or tap Retry."
    : isMatch && topArtistName
    ? `This is an artwork by ${topArtistName}. What would you like to know more about it?`
    : search
    ? "Please rescan. It may not be in our database."
    : "What would you like to know about it?";

  const hasIntro = messages.length === 0 && showChatControls;

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
      toValue: TRANSLATE_EXPANDED,
      useNativeDriver: true,
      bounciness: 6,
    }).start(() => (dragStart.current = TRANSLATE_EXPANDED));

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
            ? { ...m, pending: false, text: "Sorry, I ran into a problem." }
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

  const pushVoiceTurn = (transcript: string, answer: string) => {
    if (transcript?.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `user_voice_${Date.now()}`,
          role: "user",
          text: transcript.trim(),
          channel: "voice",
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
          channel: "voice",
        },
      ]);
    }
  };

  const photoScale = useRef(new Animated.Value(1)).current;
  const photoTranslateX = useRef(new Animated.Value(0)).current;
  const photoTranslateY = useRef(new Animated.Value(0)).current;
  const photoGesture = useRef({
    scale: 1,
    baseScale: 1,
    translateX: 0,
    translateY: 0,
    baseTranslateX: 0,
    baseTranslateY: 0,
    pinchDistance: 0,
    panX: 0,
    panY: 0,
  }).current;

  const clampPhotoPan = useCallback(
    (x: number, y: number, scale = photoGesture.scale) => {
      if (scale <= 1) {
        return { x: 0, y: 0 };
      }

      const maxX = (screenWidth * (scale - 1)) / 2;
      const maxY = (screenHeight * (scale - 1)) / 2;

      return {
        x: clamp(x, -maxX, maxX),
        y: clamp(y, -maxY, maxY),
      };
    },
    [photoGesture, screenHeight, screenWidth]
  );

  const photoPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;
          return (
            touches.length >= 2 ||
            (photoGesture.scale > 1.01 &&
              Math.abs(gestureState.dx) + Math.abs(gestureState.dy) > 4)
          );
        },
        onPanResponderGrant: (evt) => {
          const touches = evt.nativeEvent.touches;
          photoGesture.baseScale = photoGesture.scale;
          photoGesture.baseTranslateX = photoGesture.translateX;
          photoGesture.baseTranslateY = photoGesture.translateY;
          photoGesture.pinchDistance = getTouchDistance(touches);
          photoGesture.panX = touches[0]?.pageX ?? 0;
          photoGesture.panY = touches[0]?.pageY ?? 0;
        },
        onPanResponderMove: (evt, gestureState) => {
          const touches = evt.nativeEvent.touches;

          if (touches.length >= 2) {
            const distance = getTouchDistance(touches);
            const pinchStart = photoGesture.pinchDistance || distance || 1;
            const nextScale = clamp(
              photoGesture.baseScale * (distance / pinchStart),
              MIN_PHOTO_SCALE,
              MAX_PHOTO_SCALE
            );
            const pan = clampPhotoPan(
              photoGesture.baseTranslateX + gestureState.dx,
              photoGesture.baseTranslateY + gestureState.dy,
              nextScale
            );

            photoGesture.scale = nextScale;
            photoGesture.translateX = pan.x;
            photoGesture.translateY = pan.y;
            photoScale.setValue(nextScale);
            photoTranslateX.setValue(pan.x);
            photoTranslateY.setValue(pan.y);
            return;
          }

          if (photoGesture.scale <= 1.01) return;

          const pan = clampPhotoPan(
            photoGesture.baseTranslateX + gestureState.dx,
            photoGesture.baseTranslateY + gestureState.dy
          );
          photoGesture.translateX = pan.x;
          photoGesture.translateY = pan.y;
          photoTranslateX.setValue(pan.x);
          photoTranslateY.setValue(pan.y);
        },
        onPanResponderRelease: () => {
          if (Math.abs(photoGesture.scale - 1) <= PHOTO_RESET_THRESHOLD) {
            photoGesture.scale = 1;
            photoGesture.translateX = 0;
            photoGesture.translateY = 0;
            Animated.parallel([
              Animated.spring(photoScale, {
                toValue: 1,
                useNativeDriver: true,
              }),
              Animated.spring(photoTranslateX, {
                toValue: 0,
                useNativeDriver: true,
              }),
              Animated.spring(photoTranslateY, {
                toValue: 0,
                useNativeDriver: true,
              }),
            ]).start();
            return;
          }

          const pan = clampPhotoPan(
            photoGesture.translateX,
            photoGesture.translateY
          );
          photoGesture.translateX = pan.x;
          photoGesture.translateY = pan.y;
          Animated.parallel([
            Animated.spring(photoTranslateX, {
              toValue: pan.x,
              useNativeDriver: true,
            }),
            Animated.spring(photoTranslateY, {
              toValue: pan.y,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [
      clampPhotoPan,
      photoGesture,
      photoScale,
      photoTranslateX,
      photoTranslateY,
    ]
  );

  useEffect(() => {
    photoGesture.scale = 1;
    photoGesture.translateX = 0;
    photoGesture.translateY = 0;
    photoScale.setValue(1);
    photoTranslateX.setValue(0);
    photoTranslateY.setValue(0);
  }, [photo?.uri, photoGesture, photoScale, photoTranslateX, photoTranslateY]);

  return (
    <SafeAreaView style={styles.root} edges={["left", "right"]}>
      <View style={styles.photoLayer} {...photoPanResponder.panHandlers}>
        <Animated.Image
          style={[
            styles.photo,
            {
              transform: [
                { translateX: photoTranslateX },
                { translateY: photoTranslateY },
                { scale: photoScale },
              ],
            },
          ]}
          source={{
            uri: photo?.base64
              ? `data:image/jpg;base64,${photo.base64}`
              : photo?.uri ?? "",
          }}
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
          <AntDesign name="close" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: sheetHeight, // dynamic
            bottom: sheetBottom + footerOffset,
            transform: [{ translateY }],
          },
        ]}
      >
        <View
          style={activeMode ? styles.sheetBodyActive : styles.sheetBodyInactive}
          onLayout={(e) => {
            if (activeMode) return;
            setInactiveContentH(e.nativeEvent.layout.height);
          }}
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
            <View
              style={[
                styles.sheetInner,
                activeMode && styles.sheetInnerActive,
              ]}
            >
              {error && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 6 }}>
                  <View style={styles.errorCard}>
                    <View style={styles.errorRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontWeight: "700" }}>
                          {retrying
                            ? "Getting things ready…"
                            : "Something went wrong"}
                        </Text>
                        <Text style={{ color: "#5F6368" }}>
                          {retrying
                            ? "server is waking up."
                            : "Please try again."}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={runSearch}
                        style={styles.retryChip}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.retryChipText}>Retry</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}

              {search && !isMatch && (
                <View style={{ paddingHorizontal: 12, paddingVertical: 2 }}>
                  <View style={styles.noMatchCard}>
                    <Text style={styles.noMatchTitle}>No Match Found!</Text>

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

              {/* Messages list */}
              <ScrollView
                ref={scrollViewRef}
                style={[
                  styles.messagesScroll,
                  activeMode && styles.messagesScrollActive,
                ]}
                contentContainerStyle={[
                  { paddingHorizontal: 8 },
                  activeMode && { flexGrow: 1 },
                  hasIntro
                    ? {
                        paddingBottom: 12,
                      }
                    : {
                        paddingBottom: 8,
                      },
                ]}
                onContentSizeChange={() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }}
                keyboardShouldPersistTaps="handled"
                scrollEnabled={activeMode}
                showsVerticalScrollIndicator={false}
              >
                {messages.length === 0 && (
                  <View
                    style={[styles.rowLeft, { marginTop: 0, marginBottom: 12 }]}
                  >
                    <MaterialCommunityIcons
                      name="robot-outline"
                      size={28}
                      color="black"
                      style={{ marginTop: 2 }}
                    />
                    <View style={styles.leftMsgContainer}>
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
                          <Text style={styles.bubbleTextBot}>
                            {bubbleText}
                          </Text>
                        )}
                      </View>
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
            </View>
          )}
        </View>
      </Animated.View>

      {showChatControls ? (
        <View
          style={[styles.footer, { bottom: sheetBottom }]}
          onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}
        >
          <ScrollView
            horizontal
            style={[styles.suggestionsScroll, hasIntro && { marginTop: 2 }]}
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
                if (!kbVisible && messages.length > 0) {
                  Animated.spring(translateY, {
                    toValue: TRANSLATE_EXPANDED,
                    useNativeDriver: true,
                    bounciness: 6,
                  }).start(() => (dragStart.current = TRANSLATE_EXPANDED));
                }
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({
                    animated: true,
                  });
                }, 100);
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
              <AntDesign name="arrow-up" size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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

  sheetBodyActive: { flex: 1, minHeight: 0 },
  sheetBodyInactive: {},

  sheetInner: { paddingHorizontal: 12, paddingTop: 0 },
  sheetInnerActive: { flex: 1, minHeight: 0 },

  messagesScroll: { minHeight: 0 },
  messagesScrollActive: { flex: 1 },

  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "white",
    paddingHorizontal: 12,
    zIndex: 7,
  },

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
    fontSize: 16,
    textAlign: "left",
    lineHeight: 20,
  },

  suggestionsScroll: { marginTop: 6, marginBottom: 6 },
  suggestionsRow: { paddingHorizontal: 6, alignItems: "center" },
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
    padding: 12,
    borderRadius: 100,
    zIndex: 20,
  },
  bubbleStrong: {
    fontWeight: "bold",
    color: "#000",
  },
  rowLeft: {
    width: "100%",
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
  errorCard: {
    backgroundColor: "#FFF8E1",
    borderColor: "#FBC02D",
    borderWidth: 1,
    borderRadius: 10,
    padding: 8,
  },

  errorRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  retryChip: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1A73E8",
    alignSelf: "flex-start",
  },

  retryChipText: {
    color: "white",
    fontWeight: "600",
  },
});

export default PhotoRAGChat;
