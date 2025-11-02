import ChatHistory from "@/components/ChatHistory";
import { SignedIn, useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native"; // ← add
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export default function Profile() {
  const { user } = useUser();
  const { signOut } = useAuth();

  const [refreshKey, setRefreshKey] = React.useState(0);
  useFocusEffect(
    React.useCallback(() => {
      setRefreshKey((k) => k + 1);
      return undefined;
    }, [])
  );

  const fullName = user?.fullName || "Anonymous User";
  const email = user?.emailAddresses?.[0]?.emailAddress || "—";

  return (
    <View className="flex-1 bg-[#F7F7F8]">
      <SignedIn>
        <View className="px-4 pt-5 pb-3 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            className="px-2 py-1 -ml-2"
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View className="w-9 h-9 bg-blue-50 items-center justify-center">
              <Ionicons name="chevron-back" size={22} color="#2563eb" />
            </View>
          </TouchableOpacity>

          <Text className="text-2xl font-extrabold">Profile</Text>
          <View style={{ width: 36 }} />
        </View>

        <View
          className="mx-4 mb-4 p-5 bg-white border border-gray-100"
          style={{
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <View className="items-center">
            {user?.imageUrl ? (
              <ExpoImage
                source={{ uri: user.imageUrl }}
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: 9999,
                  backgroundColor: "#EEE",
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <View className="w-26 h-26 rounded-full bg-gray-200 items-center justify-center" />
            )}

            <Text className="text-xl font-bold mt-3">{fullName}</Text>
            <Text className="text-gray-500 mt-1">{email}</Text>

            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity
                className="px-4 py-2 bg-red-500 rounded-lg"
                activeOpacity={0.8}
                onPress={() => signOut()}
              >
                <Text className="text-white font-extrabold ">Log out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View className="flex-1 pt-2">
          <ChatHistory key={refreshKey} />
        </View>
      </SignedIn>
    </View>
  );
}
