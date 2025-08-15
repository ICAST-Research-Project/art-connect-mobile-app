import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  Animated,
  PanResponder,
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { CameraCapturedPicture } from "expo-camera";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  AntDesign,
  Fontisto,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { router } from "expo-router";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from "expo-audio";

type Props = {
  photo: CameraCapturedPicture;
  onOpenCamera?: () => void;
  onMicPress?: () => void;
  onSendMessage?: (msg: string) => void;
  handleRetakePhoto?: () => void;
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = Math.min(210, Math.floor(SCREEN_HEIGHT * 0.55));
const PEEK = 180;
const TRANSLATE_COLLAPSED = SHEET_HEIGHT - PEEK;
const TRANSLATE_MID = Math.floor((SHEET_HEIGHT - PEEK) / 2);
const TRANSLATE_EXPANDED = 0;

const SUGGESTIONS = [
  "What is the significance of this work?",
  "Who is the artist?",
  "Materials & technique?",
];

const PhotoRAGChat = ({
  photo,
  onOpenCamera,
  onSendMessage,
  handleRetakePhoto,
}: Props) => {
  const insets = useSafeAreaInsets();
  const openCamera = onOpenCamera ?? handleRetakePhoto;

  const [text, setText] = useState("");

  const translateY = useRef(new Animated.Value(TRANSLATE_COLLAPSED)).current;
  const dragStart = useRef(TRANSLATE_COLLAPSED);

  const [kbHeight, setKbHeight] = useState(0);
  const [kbVisible, setKbVisible] = useState(false);

  const effectiveKb =
    Platform.OS === "ios"
      ? Math.max(kbHeight - (insets.bottom || 0), 0)
      : kbHeight;

  useEffect(() => {
    const onShow = (e: any) => {
      setKbVisible(true);
      setKbHeight(e?.endCoordinates?.height ?? 0);

      Animated.spring(translateY, {
        toValue: TRANSLATE_EXPANDED,
        useNativeDriver: true,
        bounciness: 6,
      }).start(() => (dragStart.current = TRANSLATE_EXPANDED));
    };

    const onHide = () => {
      setKbVisible(false);
      setKbHeight(0);

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

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
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

  const handleSend = (msg?: string) => {
    const toSend = (msg ?? text).trim();
    if (!toSend) return;
    onSendMessage?.(toSend);
    setText("");

    Animated.spring(translateY, {
      toValue: TRANSLATE_MID,
      useNativeDriver: true,
      bounciness: 6,
    }).start(() => (dragStart.current = TRANSLATE_MID));
  };

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(audioRecorder);

  const mmss = useMemo(() => {
    const ms = recState.durationMillis ?? 0;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [recState.durationMillis]);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        Alert.alert("Microphone permission is required to record.");
        return;
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
    })();
  }, []);

  const onAudioRecorded = (uri: string) => {
    // TODO: upload or send to RAG endpoint
    console.log("Recorded file:", uri);
  };

  const [voiceVisible, setVoiceVisible] = useState(false);
  const micPulse = useRef(new Animated.Value(1)).current;

  const startPulse = () => {
    micPulse.setValue(1);
    Animated.loop(
      Animated.sequence([
        Animated.timing(micPulse, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(micPulse, {
          toValue: 0.9,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulse = () => {
    micPulse.stopAnimation();
    micPulse.setValue(1);
  };

  const stopRecordingNow = async () => {
    try {
      if (recState.isRecording) {
        await audioRecorder.stop();
      }
    } catch (e) {
      console.warn("Stop failed:", e);
    } finally {
      stopPulse();
      setVoiceVisible(false);
      if (audioRecorder.uri) onAudioRecorded(audioRecorder.uri);
    }
  };

  const cancelRecording = async () => {
    try {
      if (recState.isRecording) {
        await audioRecorder.stop();
      }
    } catch {}
    stopPulse();
    setVoiceVisible(false);
  };

  const onMicPress = async () => {
    try {
      if (recState.isRecording) {
        await stopRecordingNow();
      } else {
        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();
        setVoiceVisible(true);
        startPulse();
      }
    } catch (e) {
      console.warn("Audio record error:", e);
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
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            if (voiceVisible) {
              cancelRecording();
              return;
            }
            if (openCamera) {
              openCamera();
            } else {
              router.replace("/camera");
            }
          }}
        >
          <AntDesign name="close" size={32} color="white" />
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            height: SHEET_HEIGHT + (kbVisible ? 0 : Math.max(insets.bottom, 8)),
            bottom: kbVisible ? effectiveKb : 0,
            transform: [{ translateY }],
          },
        ]}
      >
        <View
          {...panResponder.panHandlers}
          style={styles.handleArea}
          hitSlop={{ top: 8, bottom: 8, left: 40, right: 40 }}
        >
          <View style={styles.handle} />
        </View>

        {voiceVisible ? (
          <View
            style={[
              styles.listenSheetContainer,
              { paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            {/* Row with mic + text side-by-side */}
            <View style={styles.listenHeaderRow}>
              <Animated.View
                style={[styles.listenMic, { transform: [{ scale: micPulse }] }]}
              >
                <MaterialCommunityIcons
                  name="microphone"
                  size={28}
                  color="white"
                />
              </Animated.View>
              <Text style={styles.listenHeader}>Listening...</Text>
            </View>

            {/* <Text style={styles.listenTimer}>{mmss}</Text> */}

            <View style={styles.listenActions}>
              <TouchableOpacity
                onPress={cancelRecording}
                style={styles.listenCancel}
                activeOpacity={0.85}
              >
                <Text style={styles.listenCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={stopRecordingNow}
                style={styles.listenStop}
                activeOpacity={0.85}
              >
                <Text style={styles.listenStopText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.sheetInner}>
            <ScrollView
              style={{ flexGrow: 0, maxHeight: SHEET_HEIGHT - 150 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.row}>
                <View>
                  <MaterialCommunityIcons
                    name="robot-outline"
                    size={34}
                    color="black"
                  />
                </View>
                <View style={styles.bubble}>
                  <Text style={styles.bubbleText}>
                    What would you like to know about it?
                  </Text>
                </View>
              </View>
            </ScrollView>

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
                >
                  <Text style={styles.suggestionText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View
              style={[
                styles.inputRow,
                {
                  paddingBottom: kbVisible ? 0 : Math.max(insets.bottom, 8),
                },
              ]}
            >
              <TouchableOpacity
                onPress={openCamera}
                activeOpacity={0.8}
                style={styles.iconButton}
              >
                <Fontisto name="camera" size={18} />
              </TouchableOpacity>

              <TextInput
                placeholder="Message"
                placeholderTextColor="#9AA0A6"
                value={text}
                onChangeText={setText}
                style={styles.input}
                returnKeyType="send"
                onSubmitEditing={() => handleSend()}
                onFocus={() => {
                  Animated.spring(translateY, {
                    toValue: TRANSLATE_EXPANDED,
                    useNativeDriver: true,
                    bounciness: 6,
                  }).start(() => (dragStart.current = TRANSLATE_EXPANDED));
                }}
              />

              <TouchableOpacity
                onPress={onMicPress}
                activeOpacity={0.8}
                style={styles.iconButton}
              >
                <MaterialCommunityIcons
                  name={recState.isRecording ? "stop-circle" : "microphone"}
                  size={20}
                  color={recState.isRecording ? "red" : undefined}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleSend()}
                activeOpacity={0.8}
                style={styles.sendButton}
              >
                <AntDesign name="arrowup" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "black" },
  photoLayer: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  photo: { width: "100%", height: "100%" },

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
  },
  handleArea: { paddingTop: 10, paddingBottom: 12, alignItems: "center" },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: "#DADCE0" },

  sheetInner: { paddingHorizontal: 12 },

  listenSheetContainer: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  listenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  listenHeader: {
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
  },
  listenMic: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A73E8",
  },
  listenTimer: { fontSize: 14, color: "#5F6368", marginTop: 6 },
  listenActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  listenCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F1F3F4",
  },
  listenCancelText: { color: "#202124", fontWeight: "600" },
  listenStop: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EA4335",
  },
  listenStopText: { color: "white", fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  bubble: {
    backgroundColor: "#F1F3F4",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    maxWidth: "88%",
  },
  bubbleText: { color: "#202124", fontSize: 14 },

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
});

export default PhotoRAGChat;
