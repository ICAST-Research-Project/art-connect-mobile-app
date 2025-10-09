import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { File, Paths } from "expo-file-system";
import * as FSLegacy from "expo-file-system/legacy";

function extForMime(mime: string) {
  switch (mime) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/mp4":
    case "audio/aac":
    case "audio/m4a":
      return "m4a";
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/wav":
      return "wav";
    default:
      return "mp3";
  }
}

export async function playBase64Audio(b64: string, mime = "audio/mpeg") {
  const ext = extForMime(mime);

  const base64 = b64.replace(/^data:.*;base64,/, "");

  const filename = `tts-${Date.now()}.${ext}`;
  const file = new File(Paths.cache, filename);
  const uri = file.uri;

  let wrote = false;
  const anyFile = file as any;

  try {
    if (typeof anyFile.write === "function") {
      await anyFile.write({ data: base64, encoding: "base64" });
      wrote = true;
    }
  } catch (e) {}

  if (!wrote) {
    try {
      await anyFile.write(base64, { encoding: "base64" });
      wrote = true;
    } catch (e) {}
  }

  if (!wrote) {
    await FSLegacy.writeAsStringAsync(uri, base64, { encoding: "base64" });
    wrote = true;
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: true }
  );

  return sound;
}
