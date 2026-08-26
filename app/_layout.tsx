import { DarkTheme } from "@react-navigation/native";
import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import { UCL } from "@/constants/theme";

export const unstable_settings = {
  anchor: "(tabs)",
};

const UCLTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: UCL.bg,
    card: UCL.bgCard,
    border: UCL.border,
    primary: UCL.gold,
    text: UCL.textPrimary,
  },
};

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={UCLTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: UCL.bgCard },
            headerTintColor: UCL.textPrimary,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="setup" options={{ headerShown: false }} />
          <Stack.Screen name="draw" options={{ headerShown: false }} />
          <Stack.Screen name="match" options={{ headerShown: false }} />
          <Stack.Screen name="palmares" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style="light" translucent={false} backgroundColor={UCL.bg} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
