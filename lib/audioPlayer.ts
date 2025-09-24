import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";

export async function playBase64Audio(
  audioB64: string,
  mime: string = "audio/mpeg"
) {
  const clean = audioB64.replace(/^data:.*;base64,/, "");
  const ext = mime.includes("m4a") || mime.includes("mp4") ? "m4a" : "mp3";
  const path = `${FileSystem.cacheDirectory}reply_${Date.now()}.${ext}`;

  await FileSystem.writeAsStringAsync(path, clean, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { sound } = await Audio.Sound.createAsync({ uri: path });
  await sound.playAsync();
  return sound;
}
