import { icons } from "@/constants/icons";
import { useUser } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { Image, View } from "react-native";

export default function Layout() {
  const { isSignedIn } = useUser();

  const TabIcon = ({ focused, icon }: any) => (
    <View
      style={{
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 3,
        borderColor: focused ? "#1A73E8" : "#A8B5DB",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#0F0D23",
        marginTop: -20,
      }}
    >
      <Image
        source={icon}
        style={{ width: 28, height: 28, tintColor: "white" }}
      />
    </View>
  );

  if (!isSignedIn) return <Redirect href={"/sign-in"} />;

  return (
    <Tabs
      screenOptions={({ route }) => {
        // Hide the tab bar for ALL chat routes and the camera
        const hideBar =
          route.name === "camera" || route.name.startsWith("chat/");
        return {
          tabBarShowLabel: false,
          tabBarStyle: [
            {
              backgroundColor: "transparent",
              position: "absolute",
              borderTopWidth: 0,
              elevation: 0,
              height: 80,
            },
            hideBar && { display: "none" },
          ],
          headerShown: false, // default off (you can still override per-screen)
        };
      }}
    >
      <Tabs.Screen name="index" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="search" options={{ href: null, headerShown: false }} />
      <Tabs.Screen
        name="camera"
        options={{
          title: "Scan & Chat",
          headerShown: false,
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.camera} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="museums/[museumId]"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="collections/[collectionId]"
        options={{ href: null, headerShown: false }}
      />

      <Tabs.Screen
        name="chat/[id]"
        options={{ href: null, headerShown: false }}
      />
      <Tabs.Screen
        name="chat/from-image"
        options={{ href: null, headerShown: false }}
      />
    </Tabs>
  );
}
