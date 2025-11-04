/* eslint-disable @typescript-eslint/no-unused-vars */
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { playBase64Audio } from "@/lib/audioPlayer";
import { useMuseumApi } from "@/lib/museumApi";

type Props = {
  visible: boolean;
  onClose: () => void;
  onRecorded?: (uri: string) => void;
  scanId: string;
  artworkId?: string;
  artistId?: string;
  voiceId?: string;
  bottomPadding?: number;
  onAnswer?: (text: string) => void;
  onVoiceTurn?: (transcript: string, answer: string) => void;
};

type Phase = "listening" | "processing" | "playing";

// ---- VAD tuning ----
const SILENCE_DB = -30;
const SILENCE_MS = 1400;
const POLL_MS = 120;
const MIN_SPEECH_MS = 450;
const START_GRACE_MS = 400;
const NO_SPEECH_TIMEOUT_MS = 5000;

// ---- Interruption mode shims (SDK-proof) ----
const IM_IOS =
  (InterruptionModeIOS as any)?.DoNotMix ??
  (Audio as any)?.INTERRUPTION_MODE_IOS_DO_NOT_MIX ??
  null;

const IM_ANDROID =
  (InterruptionModeAndroid as any)?.DoNotMix ??
  (Audio as any)?.INTERRUPTION_MODE_ANDROID_DO_NOT_MIX ??
  null;

// ---- Small helpers ----
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function hardEnableAudio() {
  try {
    await Audio.setIsEnabledAsync(false);
    await delay(80);
    await Audio.setIsEnabledAsync(true);
  } catch {}
}

function listeningModeOptions() {
  const base: any = {
    allowsRecordingIOS: true, // ignored on Android
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  };
  if (IM_IOS != null) base.interruptionModeIOS = IM_IOS;
  if (IM_ANDROID != null) base.interruptionModeAndroid = IM_ANDROID;
  return base;
}

function playbackModeOptions() {
  const base: any = {
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  };
  if (IM_IOS != null) base.interruptionModeIOS = IM_IOS;
  if (IM_ANDROID != null) base.interruptionModeAndroid = IM_ANDROID;
  return base;
}

async function setModeListening() {
  try {
    await Audio.setAudioModeAsync(listeningModeOptions());
  } catch {}
}

async function setModePlayback() {
  try {
    await Audio.setAudioModeAsync(playbackModeOptions());
  } catch {}
}

// ---- Android mic permission (explicit) ----
async function ensureAndroidMicPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const granted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  );
  if (granted) return true;

  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

const VoiceRAGChat: React.FC<Props> = ({
  visible,
  onClose,
  onRecorded,
  scanId,
  artworkId,
  artistId,
  voiceId,
  bottomPadding = 8,
  onAnswer,
  onVoiceTurn,
}) => {
  const { postVoiceChatFromFile } = useMuseumApi();

  const [phase, setPhase] = useState<Phase>("listening");
  const [muted, setMuted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [durationMs, setDurationMs] = useState(0);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const lastVoiceTimeRef = useRef<number>(Date.now());
  const speechDetectedRef = useRef<boolean>(false);
  const speechStartRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const playingSoundRef = useRef<Audio.Sound | null>(null);

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

  const isActiveRef = useRef(false);
  useEffect(() => {
    isActiveRef.current = visible;
  }, [visible]);

  const unloadPlayingSound = async () => {
    try {
      if (playingSoundRef.current) {
        // @ts-ignore
        playingSoundRef.current.setOnPlaybackStatusUpdate &&
          playingSoundRef.current.setOnPlaybackStatusUpdate(null);
        await playingSoundRef.current.unloadAsync();
      }
    } catch {}
    playingSoundRef.current = null;
  };

  const hardStopRecording = async () => {
    try {
      if (recordingRef.current) {
        const status = await recordingRef.current
          .getStatusAsync()
          .catch(() => null);
        if (status?.isRecording) {
          await recordingRef.current.stopAndUnloadAsync();
        }
      }
    } catch {}
    recordingRef.current = null;
  };

  const safeResetAudioStack = async () => {
    await unloadPlayingSound().catch(() => {});
    await hardStopRecording().catch(() => {});
    await delay(100);
  };

  // ---------- recording with status callback (no polling timer) ----------
  const beginRecording = async () => {
    if (!isActiveRef.current) return;

    // Double-check both Expo + Android runtime permissions
    const expoPerm = await Audio.getPermissionsAsync().catch(() => null);
    if (expoPerm?.status !== "granted") {
      const req = await Audio.requestPermissionsAsync().catch(() => null);
      if (req?.status !== "granted") {
        Alert.alert("Microphone permission is required to record.");
        return;
      }
    }
    const droidOk = await ensureAndroidMicPermission();
    if (!droidOk) {
      Alert.alert(
        "Microphone disabled",
        "Please enable microphone permission in Settings to use voice."
      );
      return;
    }

    await safeResetAudioStack();
    await hardEnableAudio();
    await setModeListening();
    await delay(80); // let AV session settle

    try {
      const recordingOptions: Audio.RecordingOptions = {
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        isMeteringEnabled: true, // metering may be undefined on some Androids; we handle that below
        web: {
          mimeType: "audio/webm;codecs=opus",
          bitsPerSecond: 128000,
        },
      };

      const onStatus = (st: Audio.RecordingStatus) => {
        if (!isActiveRef.current) return;

        if (typeof st.durationMillis === "number") {
          setDurationMs(st.durationMillis);
        }

        // If paused/muted or not recording, drop the pulse UI.
        if (!st.isRecording || muted) {
          setVoiceActive(false);
          stopPulse();
          return;
        }

        // NOTE: On many Android devices, `metering` is undefined. Treat "undefined"
        // as "possibly speaking" so the UI doesn't look dead; we still rely on
        // the timeout to auto-stop if truly silent.
        const level = (st as any).metering as number | undefined;
        const now = Date.now();

        if (typeof level === "number" ? level > SILENCE_DB : true) {
          if (!speechDetectedRef.current) {
            speechDetectedRef.current = true;
            speechStartRef.current = now;
          }
          setVoiceActive(true);
          lastVoiceTimeRef.current = now;
          startPulse();
        } else {
          setVoiceActive(false);
          stopPulse();

          if (speechDetectedRef.current) {
            const silentFor = now - lastVoiceTimeRef.current;
            const voicedMs = lastVoiceTimeRef.current - speechStartRef.current;
            const minSpeechSatisfied = voicedMs >= MIN_SPEECH_MS;

            if (
              silentFor > SILENCE_MS &&
              minSpeechSatisfied &&
              !stoppingRef.current
            ) {
              stoppingRef.current = true;
              stopRecordingAndSubmit();
            }
          } else if (
            now - lastVoiceTimeRef.current > NO_SPEECH_TIMEOUT_MS &&
            !stoppingRef.current
          ) {
            stoppingRef.current = true;
            stopRecordingAndSubmit();
          }
        }
      };

      const { recording } = await Audio.Recording.createAsync(
        recordingOptions,
        onStatus,
        POLL_MS
      );

      if (!isActiveRef.current) {
        await recording.stopAndUnloadAsync().catch(() => {});
        return;
      }

      recordingRef.current = recording;

      // reset UI/VAD state for a fresh turn
      setPhase("listening");
      setMuted(false);
      setDurationMs(0);
      setVoiceActive(false);
      lastVoiceTimeRef.current = Date.now();
      speechDetectedRef.current = false;
      speechStartRef.current = 0;
    } catch (e) {
      console.warn("Recording.createAsync error:", e);
      Alert.alert("Could not start recording.");
    }
  };

  const stopRecordingAndSubmit = async () => {
    try {
      if (!isActiveRef.current) return;

      const rec = recordingRef.current;
      if (rec) {
        const status = await rec.getStatusAsync().catch(() => null);
        if (status?.isRecording) await rec.stopAndUnloadAsync();
      }

      const uri = rec?.getURI();
      recordingRef.current = null;
      stopPulse();
      setVoiceActive(false);

      if (uri && isActiveRef.current) {
        onRecorded?.(uri);
        await sendAndPlay(uri);
      }
    } catch (e) {
      console.warn("Stop failed:", e);
    } finally {
      stoppingRef.current = false;
      setMuted(false);
    }
  };

  // ---------- send to API & play ----------
  const sendAndPlay = async (uri: string) => {
    try {
      if (!isActiveRef.current) return;

      setSubmitting(true);
      setPhase("processing");

      const resp = await postVoiceChatFromFile({
        audioUri: uri,
        scan_id: scanId,
        artwork_id: artworkId,
        artist_id: artistId,
        voice_id: voiceId,
      });

      if (!isActiveRef.current) return;

      const transcript = resp.transcript ?? "";
      const answer = resp.answer_text ?? "";
      if (onVoiceTurn && (transcript || answer))
        onVoiceTurn(transcript, answer);
      else if (answer && onAnswer) onAnswer(answer);

      if (resp.audio_b64) {
        setPhase("playing");
        await setModePlayback();
        await delay(120);

        const sound = await playBase64Audio(
          resp.audio_b64,
          resp.mime ?? "audio/mpeg"
        );
        playingSoundRef.current = sound as Audio.Sound | null;

        if (playingSoundRef.current?.setOnPlaybackStatusUpdate) {
          playingSoundRef.current.setOnPlaybackStatusUpdate(async (s: any) => {
            if (!s?.isLoaded) return;
            if (s.didJustFinish) {
              await unloadPlayingSound().catch(() => {});
              await hardEnableAudio();
              await setModeListening();
              if (isActiveRef.current) await beginRecording();
            }
          });
        } else {
          await delay(2000);
          await unloadPlayingSound().catch(() => {});
          await hardEnableAudio();
          await setModeListening();
          if (isActiveRef.current) await beginRecording();
        }
      } else {
        await hardEnableAudio();
        await setModeListening();
        if (isActiveRef.current) await beginRecording();
      }
    } catch (e) {
      console.warn("Voice send/play error:", e);
      Alert.alert("Sorry — I couldn’t process your voice message.");
      await hardEnableAudio();
      await setModeListening();
      if (isActiveRef.current) await beginRecording();
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- visibility lifecycle ----------
  useEffect(() => {
    isActiveRef.current = visible;

    const onOpen = async () => {
      setMuted(false);
      setVoiceActive(false);
      setDurationMs(0);
      stoppingRef.current = false;

      await safeResetAudioStack();
      await hardEnableAudio();
      await setModeListening();
      await delay(80);
      await beginRecording();
    };

    const onCloseAll = async () => {
      stopPulse();
      setMuted(false);
      setVoiceActive(false);
      setDurationMs(0);
      stoppingRef.current = false;
      await safeResetAudioStack();
      await setModePlayback(); // neutral, not recording
    };

    if (visible) {
      onOpen();
    } else {
      onCloseAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // single cleanup (avoid duplicate teardown)
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      (async () => {
        await safeResetAudioStack();
      })();
    };
  }, []);

  // ---------- controls ----------
  const toggleMute = async () => {
    if (phase !== "listening") return;

    const rec = recordingRef.current;
    if (!rec) return;

    try {
      if (!muted) {
        await rec.pauseAsync();
        setMuted(true);
        setVoiceActive(false);
        stopPulse();
      } else {
        try {
          await setModeListening();
          await rec.startAsync();
        } catch (e) {
          console.warn("resume failed, rebuilding recorder:", e);
          await hardStopRecording();
          await beginRecording();
        }
        setMuted(false);
        lastVoiceTimeRef.current = Date.now();
      }
    } catch (e) {
      console.warn("Mute toggle error:", e);
    }
  };

  const LABELS = {
    listeningActive: "Listening",
    listeningIdle: "Ask anything",
    listeningMuted: "Muted",
    processing: "Thinking…",
    playing: "Speaking…",
  } as const;

  const headerText =
    phase === "listening"
      ? muted
        ? LABELS.listeningMuted
        : voiceActive
        ? LABELS.listeningActive
        : LABELS.listeningIdle
      : phase === "processing"
      ? LABELS.processing
      : LABELS.playing;

  if (!visible) return null;

  return (
    <View
      style={[
        styles.listenSheetContainer,
        { paddingBottom: Math.max(bottomPadding, 8) },
      ]}
    >
      <View style={styles.topCenter}>
        <Animated.View
          style={[
            styles.listenMic,
            styles.listenMicLg,
            {
              transform: [
                {
                  scale:
                    phase === "listening" && voiceActive && !muted
                      ? micPulse
                      : 1,
                },
              ],
              backgroundColor:
                phase === "listening" && voiceActive && !muted
                  ? "#1A73E8"
                  : phase === "processing"
                  ? "#F9AB00"
                  : phase === "playing"
                  ? "#34A853"
                  : "#9AA0A6",
            },
          ]}
        >
          <MaterialCommunityIcons name="microphone" size={28} color="white" />
        </Animated.View>
        <View style={{ marginLeft: 8 }}>
          <Text style={styles.listenHeaderBelow}>{headerText}</Text>
        </View>
      </View>

      <View className="listenActions" style={styles.listenActions}>
        <TouchableOpacity
          onPress={toggleMute}
          disabled={phase !== "listening"}
          style={[
            styles.listenMute,
            phase !== "listening" && { opacity: 0.5 },
            muted && styles.listenMuteActive,
          ]}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="microphone"
            size={22}
            color={muted ? "white" : "#202124"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onClose}
          style={styles.listenCancel}
          activeOpacity={0.85}
        >
          <AntDesign name="close" size={20} color="#202124" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  listenSheetContainer: {
    flex: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topCenter: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  listenHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  listenHeader: { fontSize: 18, fontWeight: "700", color: "#202124" },
  subText: { fontSize: 12, color: "#5F6368", marginTop: 2 },

  listenMic: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A73E8",
  },

  listenMicLg: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },

  listenHeaderBelow: {
    marginTop: 30,
    fontSize: 18,
    fontWeight: "700",
    color: "#202124",
    textAlign: "center",
  },

  listenActions: {
    flexDirection: "row",
    gap: 25,
    marginTop: 20,
  },
  listenCancel: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "#F1F3F4",
  },
  listenMute: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
  },
  listenMuteActive: { backgroundColor: "#EA4335" },
});

export default VoiceRAGChat;
