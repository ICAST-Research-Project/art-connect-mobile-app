/* eslint-disable @typescript-eslint/no-unused-vars */
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Props = {
  visible: boolean;
  onClose: () => void;
  onRecorded?: (uri: string) => void;
  bottomPadding?: number;
};

const VoiceRAGChat: React.FC<Props> = ({
  visible,
  onClose,
  onRecorded,
  bottomPadding = 8,
}) => {
  const [muted, setMuted] = useState(false);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recState = useAudioRecorderState(audioRecorder);

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

  const mmss = useMemo(() => {
    const ms = recState.durationMillis ?? 0;
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [recState.durationMillis]);

  // When visible: request permission, set audio mode, start recording
  useEffect(() => {
    let mounted = true;
    const start = async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) {
          Alert.alert("Microphone permission is required to record.");
          onClose();
          return;
        }
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });

        await audioRecorder.prepareToRecordAsync();
        await audioRecorder.record(); // start recording
        if (mounted) {
          setMuted(false);
          startPulse();
        }
      } catch (e) {
        console.warn("Audio record start error:", e);
        onClose();
      }
    };

    if (visible) start();

    return () => {
      mounted = false;
      stopPulse();
      setMuted(false);
      // ensure stop if unmounting while recording
      try {
        if (recState.isRecording) audioRecorder.stop();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Keep pulse stopped while muted; resume when unmuted
  useEffect(() => {
    if (!visible) return;
    if (muted) stopPulse();
    else startPulse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, visible]);

  // ✅ MUTE = pause(); UNMUTE = record() to resume
  const toggleMute = async () => {
    try {
      if (!recState.isRecording && !muted) {
        // if we somehow aren't recording yet, start
        await audioRecorder.record();
      }
      if (!muted) {
        // go to muted state -> pause recording
        await audioRecorder.pause();
        setMuted(true);
      } else {
        // unmute -> resume recording
        await audioRecorder.record();
        setMuted(false);
      }
    } catch (e) {
      console.warn("Mute toggle error:", e);
    }
  };

  const stopRecordingNow = async () => {
    try {
      if (recState.isRecording) {
        await audioRecorder.stop();
      }
      if (audioRecorder.uri) {
        console.log("Recorded file:", audioRecorder.uri); // <- you'll see this
        onRecorded?.(audioRecorder.uri);
      }
    } catch (e) {
      console.warn("Stop failed:", e);
    } finally {
      stopPulse();
      setMuted(false);
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <View
      style={[
        styles.listenSheetContainer,
        { paddingBottom: Math.max(bottomPadding, 8) },
      ]}
    >
      {/* Header row */}
      <View style={styles.listenHeaderRow}>
        <Animated.View
          style={[
            styles.listenMic,
            {
              transform: [{ scale: muted ? 1 : micPulse }],
              backgroundColor: muted ? "#EA4335" : "#1A73E8",
            },
          ]}
        >
          <MaterialCommunityIcons name="microphone" size={28} color="white" />
        </Animated.View>
        <Text style={styles.listenHeader}>
          {muted ? "Muted" : "Listening..."}
        </Text>
      </View>

      {/* <Text style={styles.listenTimer}>{mmss}</Text> */}

      <View style={styles.listenActions}>
        {/* Mute / Unmute */}
        <TouchableOpacity
          onPress={toggleMute}
          style={[styles.listenMute, muted && styles.listenMuteActive]}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons
            name="microphone-off"
            size={22}
            color={muted ? "white" : "#202124"}
          />
        </TouchableOpacity>

        {/* Close (stop & save) */}
        <TouchableOpacity
          onPress={stopRecordingNow}
          style={styles.listenCancel}
          activeOpacity={0.85}
        >
          <AntDesign name="close" size={20} color="#202124" />
        </TouchableOpacity>

        {/* If you prefer a separate "Stop" button, add it back here */}
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
  listenStop: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EA4335",
  },
  listenStopText: { color: "white", fontWeight: "700" },
  listenMute: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#F1F3F4",
    alignItems: "center",
    justifyContent: "center",
  },
  listenMuteActive: {
    backgroundColor: "#EA4335",
  },
});

export default VoiceRAGChat;

// import { useSpeechToText } from "@/hooks/useSpeechToText";
// import { useMuseumApi } from "@/lib/museumApi";
// import { Audio } from "expo-av";
// import * as FileSystem from "expo-file-system";
// import React, { useEffect, useRef, useState } from "react";
// import {
//   ActivityIndicator,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View,
// } from "react-native";

// type Props = {
//   visible: boolean;
//   onClose: () => void;
//   bottomPadding?: number;
//   scanId: string;
//   artworkId?: string | null;
//   artistId?: string | null;
//   voiceId?: string; // optional, server-side voice selector
// };

// const VoiceRAGChat: React.FC<Props> = ({
//   visible,
//   onClose,
//   bottomPadding = 8,
//   scanId,
//   artworkId,
//   artistId,
//   voiceId,
// }) => {
//   const { postVoiceChat } = useMuseumApi();
//   const { listening, partial, finalText, start, stop, cancel } =
//     useSpeechToText();

//   const [busy, setBusy] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const soundRef = useRef<Audio.Sound | null>(null);

//   // Prepare audio playback mode (no legacy interruption constants)
//   useEffect(() => {
//     Audio.setAudioModeAsync({
//       // Playback should respect the iOS silent switch
//       playsInSilentModeIOS: true,
//       // We’re only playing (not recording), so leave recording off here
//       allowsRecordingIOS: false,
//       staysActiveInBackground: false,
//       shouldDuckAndroid: true,
//     }).catch(() => {});
//   }, []);

//   // Auto-start listening when this sheet becomes visible; cancel when closed
//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       if (visible) {
//         setError(null);
//         try {
//           await start();
//         } catch (e: any) {
//           if (mounted) setError(e?.message ?? String(e));
//         }
//       } else {
//         await cancel();
//       }
//     })();
//     return () => {
//       mounted = false;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [visible]);

//   // Cleanup sound on unmount
//   useEffect(() => {
//     return () => {
//       if (soundRef.current) soundRef.current.unloadAsync().catch(() => {});
//     };
//   }, []);

//   const playBase64Mp3 = async (b64: string) => {
//     const fileUri = `${FileSystem.cacheDirectory}reply_${Date.now()}.mp3`;
//     await FileSystem.writeAsStringAsync(fileUri, b64, {
//       encoding: FileSystem.EncodingType.Base64,
//     });
//     if (soundRef.current) {
//       try {
//         await soundRef.current.unloadAsync();
//       } catch {}
//     }
//     const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
//     soundRef.current = sound;
//     await sound.playAsync();
//   };

//   const sendTranscript = async (text: string) => {
//     if (!text.trim()) return;
//     setBusy(true);
//     setError(null);
//     try {
//       const resp = await postVoiceChat({
//         scan_id: scanId,
//         artwork_id: artworkId ?? undefined,
//         artist_id: artistId ?? undefined,
//         prompt: text, // TEXT ONLY; server returns base64 MP3
//         voice_id: voiceId,
//       });
//       await playBase64Mp3(resp.audio_b64);
//     } catch (e: any) {
//       setError(e?.message ?? String(e));
//     } finally {
//       setBusy(false);
//     }
//   };

//   const onPressMain = async () => {
//     if (listening) {
//       // stop listening → wait for transcript → ask server → play reply
//       const text = await stop();
//       await sendTranscript(text);
//     } else {
//       // if user stopped listening previously, let them speak again
//       setError(null);
//       await start();
//     }
//   };

//   if (!visible) return null;

//   const display = listening
//     ? partial || "Listening…"
//     : finalText
//     ? `You said: ${finalText}`
//     : "";

//   return (
//     <View style={[styles.container, { paddingBottom: bottomPadding }]}>
//       <Text style={styles.title}>Voice conversation</Text>
//       {!!display && <Text style={styles.hint}>{display}</Text>}
//       {!!error && <Text style={styles.error}>{error}</Text>}

//       <View style={{ height: 16 }} />

//       <TouchableOpacity
//         style={[
//           styles.button,
//           { backgroundColor: listening ? "#EA4335" : "#1A73E8" },
//         ]}
//         onPress={onPressMain}
//         disabled={busy}
//       >
//         {busy ? (
//           <ActivityIndicator color="white" />
//         ) : (
//           <Text style={styles.buttonText}>
//             {listening ? "Stop & Ask" : "Tap to Speak"}
//           </Text>
//         )}
//       </TouchableOpacity>

//       <View style={{ height: 12 }} />
//       <TouchableOpacity
//         style={styles.outline}
//         onPress={onClose}
//         disabled={busy || listening}
//       >
//         <Text style={styles.outlineText}>Close</Text>
//       </TouchableOpacity>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   container: { paddingHorizontal: 16, paddingTop: 8 },
//   title: { fontSize: 16, fontWeight: "700" },
//   hint: { marginTop: 6, color: "#5F6368" },
//   error: { color: "red", marginTop: 8 },
//   button: {
//     paddingHorizontal: 14,
//     paddingVertical: 14,
//     borderRadius: 12,
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   buttonText: { color: "white", fontWeight: "700" },
//   outline: {
//     paddingHorizontal: 14,
//     paddingVertical: 14,
//     borderRadius: 12,
//     alignItems: "center",
//     justifyContent: "center",
//     borderColor: "#1A73E8",
//     borderWidth: 1,
//   },
//   outlineText: { color: "#1A73E8", fontWeight: "700" },
// });

// export default VoiceRAGChat;
