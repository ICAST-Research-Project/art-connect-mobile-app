import { icons } from "@/constants/icons";
import { useUser } from "@clerk/clerk-expo";
import { Redirect, Tabs } from "expo-router";
import { Image, View } from "react-native";

export default function Layout() {
  const { isSignedIn } = useUser();
  const TabIcon = ({ focused, icon, title }: any) => {
    return (
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 3,
          borderColor: focused ? "#1A73E8" : "#A8B5DB", // blue when active, gray when inactive
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0F0D23", // matches your tab bar background
          marginTop: -20, // lifts the circle above the bar a little
        }}
      >
        <Image
          source={icon}
          style={{ width: 28, height: 28, tintColor: "white" }}
        />
      </View>
    );
  };

  if (!isSignedIn) return <Redirect href={"/sign-in"} />;

  return (
    <Tabs
      // screenOptions={{
      //   tabBarShowLabel: false,
      //   tabBarItemStyle: {
      //     width: "100%",
      //     height: "100%",
      //     justifyContent: "center",
      //     alignItems: "center",
      //   },
      //   tabBarStyle: {
      //     backgroundColor: "#0F0D23",
      //     borderRadius: 50,
      //     marginHorizontal: 20,
      //     marginBottom: 36,
      //     height: 52,
      //     position: "absolute",
      //     overflow: "hidden",
      //     borderWidth: 1,
      //     borderColor: "0F0D23",
      //   },
      // }}
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: "transparent",
          position: "absolute",
          borderTopWidth: 0,
          elevation: 0,
          height: 80,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        // options={{
        //   title: "Home",
        //   headerShown: false,
        //   tabBarIcon: ({ focused }) => (
        //     <TabIcon focused={focused} icon={icons.home} title="Home" />
        //   ),
        // }}
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="search"
        // options={{
        //   title: "Search",
        //   headerShown: false,
        //   tabBarIcon: ({ focused }) => (
        //     <TabIcon focused={focused} icon={icons.search} title="Search" />
        //   ),
        // }}
        options={{
          href: null,
          headerShown: false,
        }}
      />
      {/* <Tabs.Screen
        name="camera"
        options={{
          title: "Scan & Chat",
          headerShown: false,
          tabBarStyle: { display: "none" },
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={icons.camera}
              title="Scan & Chat"
            />
          ),
        }}
      /> */}
      <Tabs.Screen
        name="camera"
        options={{
          title: "Scan & Chat",
          headerShown: false,
          tabBarStyle: { display: "none" },
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.camera} title="Scan" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        // options={{
        //   title: "Profile",
        //   headerShown: false,
        //   tabBarIcon: ({ focused }) => (
        //     <TabIcon focused={focused} icon={icons.person} title="Profile" />
        //   ),
        // }}
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="museums/[museumId]"
        options={{
          href: null,
          headerShown: false,
        }}
      />

      <Tabs.Screen
        name="collections/[collectionId]"
        options={{
          href: null,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
