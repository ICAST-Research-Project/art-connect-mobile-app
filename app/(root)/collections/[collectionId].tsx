import { CollectionDetail, fetchCollectionById } from "@/services/api";
import useFetch from "@/services/useFetch";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function CollectionDetailPage() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    collectionId?: string;
    name?: string;
    museumId?: string;
    museumName?: string;
    image?: string;
    address?: string;
  }>();

  const museumId = params.museumId;

  const collectionId = params.collectionId ?? "";
  const {
    data: collection,
    loading,
    error,
    refetch,
  } = useFetch<CollectionDetail>(
    () => fetchCollectionById(collectionId),
    !!collectionId
  );

  useFocusEffect(
    useCallback(() => {
      if (collectionId) refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectionId])
  );

  return (
    <View className="flex-1 bg-white">
      <View className="px-6 pt-6 pb-4">
        <TouchableOpacity
          onPress={() => {
            if (museumId) {
              const backParams = {
                museumId: String(museumId),
                ...(params.museumName
                  ? { name: String(params.museumName) }
                  : {}),
                ...(params.image ? { image: String(params.image) } : {}),
                ...(params.address ? { address: String(params.address) } : {}),
              } satisfies { museumId: string | number } & {
                name?: string;
                image?: string;
                address?: string;
              };

              router.push({
                pathname: "/museums/[museumId]",
                params: backParams,
              });
            } else {
              router.back();
            }
          }}
          className="mb-3"
        >
          <Text className="text-blue-600">← Back</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-extrabold">
          {params.name ?? collection?.name ?? "Collection"}
        </Text>
        <Text className="mt-4 font-semibold text-lg">All Artworks</Text>
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
        <View className="flex-1">
          <FlatList
            data={collection?.artworks ?? []}
            keyExtractor={(a) => a.id}
            numColumns={2}
            columnWrapperStyle={{ justifyContent: "space-between" }}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <View className="w-[48%] mb-3">
                <Image
                  source={{ uri: item.images?.[0] }}
                  className="w-full aspect-square"
                  resizeMode="cover"
                />
                <Text className="mt-2 text-sm font-medium" numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            )}
            ListEmptyComponent={
              <Text className="px-2 text-neutral-500">No artworks found.</Text>
            }
            refreshing={false}
            onRefresh={refetch}
          />
        </View>
      )}
    </View>
  );
}
