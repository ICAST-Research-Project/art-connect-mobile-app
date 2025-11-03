/* eslint-disable @typescript-eslint/no-unused-vars */
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
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
const NO_SPEECH_TIMEOUT_MS = 5000; // stop if nothing for 5s

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
  const meterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // const mmss = useMemo(() => {
  //   const m = Math.floor(durationMs / 60000);
  //   const s = Math.floor((durationMs % 60000) / 1000);
  //   return `${m}:${s.toString().padStart(2, "0")}`;
  // }, [durationMs]);

  const clearMeterTimer = () => {
    if (meterTimerRef.current != null) {
      clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
  };

  const unloadPlayingSound = async () => {
    try {
      if (playingSoundRef.current) {
        // @ts-ignore (type accepts function or null)
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

  // Add these helpers near the top (below refs)
  async function setModeListeningIOS() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true, // critical: record mode
        playsInSilentModeIOS: true, // respect silent switch
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false, // android-only, harmless on iOS
      });
    } catch {}
  }

  async function setModePlaybackIOS() {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false, // critical: playback mode -> speaker
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
    } catch {}
  }

  // ---------- recording with metering ----------
  const beginRecording = async () => {
    // Respect global active guard
    if (!isActiveRef.current) return;

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone permission is required to record.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      if (!isActiveRef.current) return;

      await setModeListeningIOS();

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
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
        web: {
          mimeType: "audio/webm;codecs=opus",
          bitsPerSecond: 128000,
        },
        isMeteringEnabled: true,
      });

      if (!isActiveRef.current) return;

      recordingRef.current = rec;
      await rec.startAsync();

      setPhase("listening");
      setMuted(false);
      setDurationMs(0);
      setVoiceActive(false);
      lastVoiceTimeRef.current = Date.now();
      speechDetectedRef.current = false;
      speechStartRef.current = 0;

      clearMeterTimer();
      meterTimerRef.current = setInterval(async () => {
        if (!isActiveRef.current) return;
        try {
          const status = await rec.getStatusAsync();

          if (typeof status.durationMillis === "number")
            setDurationMs(status.durationMillis);

          if (!status.isRecording || muted) {
            setVoiceActive(false);
            stopPulse();
            return;
          }

          const now = Date.now();
          const withinGrace = now - lastVoiceTimeRef.current < START_GRACE_MS;
          const level = (status as any).metering as number | undefined;

          if (typeof level === "number" && level > SILENCE_DB) {
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

            if (!withinGrace && speechDetectedRef.current) {
              const silentFor = now - lastVoiceTimeRef.current;
              const voicedMs =
                lastVoiceTimeRef.current - speechStartRef.current;
              const minSpeechSatisfied = voicedMs >= MIN_SPEECH_MS;

              if (
                silentFor > SILENCE_MS &&
                minSpeechSatisfied &&
                !stoppingRef.current
              ) {
                stoppingRef.current = true;
                clearMeterTimer();
                await stopRecordingAndSubmit();
              }
            }
          }
        } catch {}
      }, POLL_MS);
    } catch (e) {
      console.warn("Audio record start error:", e);
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
      clearMeterTimer();
      stopPulse();
      setVoiceActive(false);

      if (uri && isActiveRef.current) {
        onRecorded?.(uri);
        await sendAndPlay(uri);
      } else {
      }
    } catch (e) {
      console.warn("Stop failed:", e);
    } finally {
      stoppingRef.current = false;
      setMuted(false);
    }
  };

  const resumeAutoListening = async () => {
    if (!isActiveRef.current) return;
    if (!visible) return;
    if (recordingRef.current) return;
    await beginRecording();
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

      if (onVoiceTurn && (transcript || answer)) {
        onVoiceTurn(transcript, answer);
      } else if (answer && onAnswer) {
        onAnswer(answer);
      }

      if (resp.audio_b64) {
        setPhase("playing");
        await setModePlaybackIOS();
        await new Promise((resolve) => setTimeout(resolve, 150));
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
              // only auto-resume if still visible
              await setModeListeningIOS();
              if (isActiveRef.current) resumeAutoListening();
            }
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await setModeListeningIOS();
          if (isActiveRef.current) resumeAutoListening();
        }
      } else {
        await setModeListeningIOS();
        if (isActiveRef.current) resumeAutoListening();
      }
    } catch (e) {
      console.warn("Voice send/play error:", e);
      Alert.alert("Sorry — I couldn’t process your voice message.");
      await setModeListeningIOS();
      if (isActiveRef.current) resumeAutoListening();
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- visibility lifecycle ----------
  useEffect(() => {
    isActiveRef.current = visible;

    if (visible) {
      setMuted(false);
      setVoiceActive(false);
      setDurationMs(0);
      stoppingRef.current = false;
      beginRecording();
    } else {
      clearMeterTimer();
      stopPulse();
      setMuted(false);
      setVoiceActive(false);
      setDurationMs(0);
      stoppingRef.current = false;

      (async () => {
        await hardStopRecording();
        await unloadPlayingSound();

        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
        } catch {}
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      clearMeterTimer();
      (async () => {
        await hardStopRecording();
        await unloadPlayingSound();
      })();
    };
  }, []);

  // ---------- controls ----------
  // const toggleMute = async () => {
  //   if (phase !== "listening" || !recordingRef.current) return;
  //   try {
  //     if (!muted) {
  //       await recordingRef.current.pauseAsync();
  //       setMuted(true);
  //       setVoiceActive(false);
  //       stopPulse();
  //     } else {
  //       await recordingRef.current.startAsync();
  //       setMuted(false);
  //       lastVoiceTimeRef.current = Date.now();
  //     }
  //   } catch (e) {
  //     console.warn("Mute toggle error:", e);
  //   }
  // };
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
          await setModeListeningIOS();
          await rec.startAsync();
        } catch (e) {
          console.warn("resume failed, rebuilding recorder:", e);
          await hardStopRecording();
          clearMeterTimer();
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
          {/* {phase === "listening" ? (
            <Text style={styles.subText}>{mmss}</Text>
          ) : null} */}
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
