// hooks/useSpeechToText.ts
import Voice, {
  SpeechErrorEvent,
  SpeechResultsEvent,
} from "@react-native-voice/voice";
import { useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";

export function useSpeechToText() {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState("");
  const [finalText, setFinalText] = useState("");

  // a resolver we call when speech has ended
  const resolveRef = useRef<((t: string) => void) | null>(null);

  useEffect(() => {
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? "";
      setPartial(t);
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? "";
      setPartial("");
      setFinalText(t);
      // if someone is waiting for stop() to resolve, resolve now
      resolveRef.current?.(t);
      resolveRef.current = null;
      setListening(false);
    };

    // some devices fire this reliably on stop
    (Voice as any).onSpeechEnd = () => {
      // if results didn’t fire, resolve with best we have
      const best = finalText || partial;
      if (resolveRef.current) {
        resolveRef.current(best);
        resolveRef.current = null;
      }
      setListening(false);
    };

    Voice.onSpeechError = (_e: SpeechErrorEvent) => {
      // Resolve with whatever we have so UI isn’t stuck
      const best = finalText || partial;
      resolveRef.current?.(best);
      resolveRef.current = null;
      setListening(false);
    };

    return () => {
      Voice.destroy().catch(() => {});
      Voice.removeAllListeners();
    };
  }, [finalText, partial]);

  const start = async () => {
    setFinalText("");
    setPartial("");
    if (Platform.OS === "android") {
      const ok = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (ok !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    setListening(true);
    await Voice.start("en-US"); // change locale as needed
  };

  const stop = async (): Promise<string> => {
    // ask voice to stop; then wait for results/end or timeout
    try {
      await Voice.stop();
    } catch {
      // ignore
    }

    const bestNow = finalText || partial;
    if (bestNow) return bestNow;

    return new Promise<string>((resolve) => {
      resolveRef.current = resolve;
      // Fallback in case neither results nor end fire quickly
      const t = setTimeout(() => {
        if (resolveRef.current) {
          resolveRef.current(partial || finalText || "");
          resolveRef.current = null;
          setListening(false);
        }
      }, 1800);
      // keep the timeout alive only until resolveRef is used
      const prev = resolveRef.current;
      resolveRef.current = (text: string) => {
        clearTimeout(t);
        prev?.(text);
      };
    });
  };

  const cancel = async () => {
    setListening(false);
    setPartial("");
    setFinalText("");
    resolveRef.current?.("");
    resolveRef.current = null;
    try {
      await Voice.cancel();
    } catch {}
  };

  return { listening, partial, finalText, start, stop, cancel };
}
