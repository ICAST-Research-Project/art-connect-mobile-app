import { SignedIn, useAuth, useUser } from "@clerk/clerk-expo";
import React from "react";
import { Text, View, Image, TouchableOpacity } from "react-native";

const Profile = () => {
  const { user } = useUser();
  const { signOut } = useAuth();
  return (
    <View>
      <SignedIn>
        <View>
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
        <View className="flex items-center mt-4">
          <TouchableOpacity
            className="bg-red-500 px-6 py-3 rounded-lg"
            onPress={() => signOut()}
          >
            <Text className="text-white text-lg font-semibold">Sign Out</Text>
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
      </SignedIn>
    </View>
  );
};

export default Profile;
