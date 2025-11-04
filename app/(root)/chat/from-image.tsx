import PhotoRAGChat from "@/components/PhotoRAGChat";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

export default function FromImageChat() {
  const { imageUrl } = useLocalSearchParams<{ imageUrl?: string }>();

  if (!imageUrl) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontSize: 16 }}>Missing image URL.</Text>
      </View>
    );
  }

  return (
    <PhotoRAGChat
      key={String(imageUrl)}
      photo={{ uri: String(imageUrl) }}
      onOpenCamera={() => router.back()}
    />
  );
}
