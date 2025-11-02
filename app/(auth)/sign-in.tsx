import { useSSO } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import * as AuthSession from "expo-auth-session";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

WebBrowser.maybeCompleteAuthSession();

export default function Page() {
  useWarmUpBrowser();
  const { startSSOFlow } = useSSO();
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  const onPress = useCallback(async () => {
    try {
      setLoading(true);
      const redirectUrl = AuthSession.makeRedirectUri({
        scheme: "mobile",
        path: "sso-callback",
      });

      console.log("Using redirect URI:", redirectUrl);

      const result = await startSSOFlow({
        strategy: "oauth_google",
        redirectUrl,
      });

      console.log("SSO flow result:", result);

      const { createdSessionId, setActive, signIn, signUp, error } =
        result as any;

      if (error) {
        console.error("SSO error:", error);
        Alert.alert("Authentication error", JSON.stringify(error));
        return;
      }

      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      } else if (signIn || signUp) {
        console.log("Additional flow required:", { signIn, signUp });
      } else {
        console.warn("No session and no continuation handlers returned.");
      }
    } catch (err) {
      console.error("Unexpected exception in SSO flow:", err);
      Alert.alert("Unexpected error", JSON.stringify(err));
    } finally {
      setLoading(false);
    }
  }, [router, startSSOFlow]);

  return (
    <View className="flex-1 justify-center items-center p-4 bg-white">
      <Text className="font-extrabold text-blue-600 mb-4 text-lg">
        Get started with Art Connect
      </Text>

      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        className="flex-row items-center bg-[#f1f3f4] py-3 px-5 rounded-md"
        disabled={loading}
      >
        <View className="mr-3">
          {loading ? (
            <ActivityIndicator />
          ) : (
            <Ionicons name="logo-google" size={28} color="#4285F4" />
          )}
        </View>

        <Text className="text-lg font-semibold">
          {loading ? "Signing in..." : "Sign in with Google"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
