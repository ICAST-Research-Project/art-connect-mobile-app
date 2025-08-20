import { SignedIn, useAuth, useUser } from "@clerk/clerk-expo";
import { router } from "expo-router";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

const Profile = () => {
  const { user } = useUser();
  const { signOut } = useAuth();
  return (
    <View>
      <SignedIn>
        <View className="px-6 pt-6 pb-4">
          <TouchableOpacity onPress={() => router.back()} className="mb-3">
            <Text className="text-blue-600">← Back</Text>
          </TouchableOpacity>
          <View className="flex items-center gap-4 mt-4 mb-4">
            <Text>Full Name: {user?.fullName}</Text>
            <Text>Email: {user?.emailAddresses[0].emailAddress}</Text>
          </View>
          <View className="flex items-center">
            {user?.imageUrl && (
              <Image
                source={{ uri: user.imageUrl }}
                className="w-20 h-20 rounded-full mb-2.5"
              />
            )}
          </View>
        </View>
        <View className="flex items-center">
          <TouchableOpacity
            className="bg-red-500 px-2 py-2 rounded-lg"
            onPress={() => signOut()}
          >
            <Text className="text-white text-lg font-semibold">Log out</Text>
          </TouchableOpacity>
        </View>
        <View className="flex items-center mt-6 gap-2">
          <Text className="font-bold">
            Feel free to contact if you have any questions?
          </Text>
          <Text className="font-medium text-gray-500">
            Email: ourchidlab@gmail.com
          </Text>
        </View>
        <View className="px-6 pt-6">
          <Text>Show Chat History</Text>
        </View>
      </SignedIn>
    </View>
  );
};

export default Profile;
