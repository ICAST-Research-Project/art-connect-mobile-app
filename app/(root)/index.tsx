import SearchBar from "@/components/SearchBar";
import { fetchMuseums } from "@/services/api";
import useFetch from "@/services/useFetch";
import { SignedIn, SignedOut, useUser } from "@clerk/clerk-expo";
import { Link, useRouter } from "expo-router";
import {
  Text,
  View,
  Image,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from "react-native";

export default function Page() {
  const router = useRouter();
  const { user } = useUser();

  const {
    data: museums,
    loading: museumsLoading,
    error: museumsError,
  } = useFetch(() => fetchMuseums({ query: "" }));

  return (
    <View className="flex-1">
      <SignedIn>
        <View className="flex-1">
          <View className="flex-row items-center justify-between px-6 py-6">
            <View>
              <Text className="text-lg">Hello {user?.fullName},</Text>
              <Text className="font-extrabold text-2xl">
                Welcome to ArtInVission
              </Text>
            </View>
            {user?.imageUrl && (
              <Image
                source={{ uri: user.imageUrl }}
                className="w-20 h-20 rounded-full"
              />
            )}
          </View>
          <View className="px-4">
            <SearchBar
              onPress={() => router.push("/search")}
              placeholder="Where do you want to explore art?"
            />
          </View>
          <View className="mb-4 mt-4 px-6">
            <Text className="font-semibold text-lg">
              Select Museum to Explore
            </Text>
          </View>

          {museumsLoading ? (
            <ActivityIndicator
              size="large"
              color="#0000ff"
              className="mt-10 self-center"
            />
          ) : museumsError ? (
            <Text className="px-6 text-red-500">
              Error: {museumsError.message}
            </Text>
          ) : (
            <FlatList
              className="flex-1 px-5"
              data={museums ?? []}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/museums/[museumId]",
                      params: {
                        museumId: item.id,
                        name: item.museumName,
                        image: item.image,
                        address: item.address,
                      },
                    })
                  }
                >
                  <View className="flex-row mb-3 mt-2 border border-gray-200 rounded-lg shadow-white bg-white">
                    <Image
                      source={{ uri: item.image }}
                      className="flex-1 h-40  mr-3"
                      resizeMode="cover"
                    />
                    <View className="flex-1 justify-start">
                      <Text className="font-semibold text-2xl mt-4 mb-1">
                        {item.museumName}
                      </Text>
                      <Text className="text-lg text-neutral-500 mt-4">
                        {item.address}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text className="px-1 text-neutral-500">No museums found.</Text>
              }
            />
          )}
        </View>
      </SignedIn>

      <SignedOut>
        <Link href="/(auth)/sign-in">
          <Text>Sign in</Text>
        </Link>
      </SignedOut>
    </View>
  );
}
