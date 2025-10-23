import PhotoPreviewSection from "@/components/PhotoRAGChat";
import { AntDesign } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import { Button, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function Camera() {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<any>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const handleRetakePhoto = () => setPhoto(null);

  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const options = {
        quality: 1,
        base64: true,
        exif: false,
      } as const;
      const taken = await cameraRef.current.takePictureAsync(options);
      const processed = await ImageManipulator.manipulateAsync(
        taken.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      setPhoto({ ...taken, uri: processed.uri });
      // setPhoto(taken);
    } catch (e) {
      console.warn("takePictureAsync failed", e);
    }
  };

  if (photo) {
    return (
      <PhotoPreviewSection
        key={photo?.uri ?? String(photo)}
        photo={photo}
        onOpenCamera={handleRetakePhoto}
      />
    );
  }

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "white" }} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center" }}>
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="grant permission" />
      </View>
    );
  }

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: "black" }} />;
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing="back" ref={cameraRef}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => {
            router.back();
          }}
        >
          <AntDesign name="close" size={32} color="white" />
        </TouchableOpacity>

        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={handleTakePhoto}>
            <AntDesign name="camera" size={44} color="black" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  camera: { flex: 1 },
  buttonContainer: {
    position: "absolute",
    bottom: 100,
    left: 0,
    right: 0,
    justifyContent: "center",
    alignItems: "center",
  },

  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  text: { fontSize: 24, fontWeight: "bold", color: "white" },
  closeButton: {
    position: "absolute",
    top: 40,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 6,
    borderRadius: 20,
    zIndex: 1,
  },
});
