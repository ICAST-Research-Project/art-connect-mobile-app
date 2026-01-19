import { Collection, fetchCollections } from "@/services/api";
import useFetch from "@/services/useFetch";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function MuseumCollectionsPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    museumId?: string;
    name?: string;
    image?: string;
    address?: string;
  }>();

  const museumId = params.museumId ?? "";

  const {
    data: collections,
    loading,
    error,
    refetch,
  } = useFetch<Collection[]>(() => fetchCollections(museumId), !!museumId);

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 pt-6 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="mb-3">
          <Ionicons name="chevron-back" size={22} color="#2563eb" />
        </TouchableOpacity>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-2xl font-extrabold">
              {params.name ?? "Museum"}
            </Text>
            {params.address ? (
              <Text className="text-neutral-500">{params.address}</Text>
            ) : null}
          </View>

          {params.image ? (
            <Image
              source={{ uri: params.image as string }}
              className="w-20 h-20 rounded-lg"
            />
          ) : null}
        </View>

        <Text className="mt-4 font-semibold text-lg">Current Exhibitions</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" className="mt-10 self-center" />
      ) : error ? (
        <View className="px-6">
          <Text className="text-red-500 mb-2">Error: {error.message}</Text>
          <TouchableOpacity
            onPress={refetch}
            className="px-4 py-2 bg-blue-600 rounded-md self-start"
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={collections ?? []}
          keyExtractor={(c) => c.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View className="mb-5 border border-gray-200  overflow-hidden bg-white shadow-sm">
              <View className="flex flex-row items-center justify-between px-4 py-3 border-b border-gray-100">
                <Text
                  className="text-xl font-bold flex-1 mr-3"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.name}
                </Text>

                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/collections/[collectionId]",
                      params: {
                        collectionId: item.id,
                        name: item.name,
                        museumId: String(museumId),
                        ...(params.name
                          ? { museumName: String(params.name) }
                          : {}),
                        ...(params.image
                          ? { image: String(params.image) }
                          : {}),
                        ...(params.address
                          ? { address: String(params.address) }
                          : {}),
                      },
                    })
                  }
                  className="bg-blue-500 px-3 py-1 rounded"
                >
                  <Text className="text-white font-semibold">View All</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={item.artworks.slice(0, 3)}
                keyExtractor={(a) => a.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
                ItemSeparatorComponent={() => <View className="w-3" />}
                // renderItem={({ item: art }) => (
                //   <TouchableOpacity className="w-40">
                //     <Image
                //       source={{ uri: art.images?.[0] }}
                //       className="w-40 h-40 rounded-lg"
                //       resizeMode="cover"
                //     />
                //     <Text className="mt-2 text-sm font-medium number-of-lines-2">
                //       {art.title}
                //     </Text>
                //   </TouchableOpacity>
                // )}
                renderItem={({ item: art }) => (
                  <TouchableOpacity
                    className="w-40"
                    activeOpacity={0.9}
                    onPress={() => {
                      router.push({
                        pathname: "/chat/from-image",
                        params: {
                          imageUrl: art.images?.[0] ?? "",
                          artworkId: String(art.id ?? ""),
                        },
                      });
                    }}
                  >
                    <Image
                      source={{ uri: art.images?.[0] }}
                      className="w-40 h-40 rounded-lg"
                      resizeMode="cover"
                    />
                    <Text className="mt-2 text-sm font-medium number-of-lines-2">
                      {art.title}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text className="text-neutral-500 px-2 py-3">
                    No artworks in this collection.
                  </Text>
                }
              />
            </View>
          )}
          ListEmptyComponent={
            <Text className="px-1 text-neutral-500">No collections found.</Text>
          }
        />
      )}
    </View>
  );
}
