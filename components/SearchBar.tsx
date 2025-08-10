import { View, Image, TextInput } from "react-native";
import React from "react";
import { icons } from "@/constants/icons";

interface Props {
  placeholder: string;
  onPress: () => void;
}

const SearchBar = ({ placeholder, onPress }: Props) => {
  return (
    <View className="flex-row items-center bg-neutral-100 rounded-full px-4 py-3">
      <Image
        source={icons.search}
        className="w-5 h-5 mr-2"
        resizeMode="contain"
        tintColor="#a8b5db"
      />
      <TextInput
        onPress={onPress}
        placeholder={placeholder}
        value=""
        onChangeText={() => {}}
        placeholderTextColor="#a8b5db"
        className="flex-1 ml-2 text-black"
      />
    </View>
  );
};

export default SearchBar;
