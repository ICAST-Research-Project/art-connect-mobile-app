## Quickstart

```bash
# 1) Clone the repository
git clone https://github.com/ICAST-Research-Project/ART-IN-VISION.git
```

```bash
# 2) Enter the project folder
cd art-in-vision
```

```bash
# 3) Install dependencies
npm install
```

```bash
# 4) Create your env file
cp .env.example .env
# then edit .env with your keys (API base URL, Clerk)
```

```bash
# 5) Start the Expo dev server
npx expo start
```

```bash
# 6) Run the app
# With the dev server open:
#  - Press i to launch the IOS Simulator
#  - Press a to launch the Android emulator
#  - Or scan the QR code with the Expo Go app on your device
# Note: TO test it out using Expo Go, you have to connected to same network.
```

```bash
# (If you need a clean start)
npx expo start -clear
```

## Tech Stack

- **React Native** — cross-platform mobile framework for iOS & Android.  
  Official website: https://reactnative.dev

- **NativeWind** — Tailwind-CSS-style utility classes for styling React Native.  
  Official docs: https://www.nativewind.dev

- **Clerk** — user authentication (sign-in, sign-up, session management).  
  Official website: https://clerk.com  
  React Native docs: https://clerk.com/docs/references/react-native

- **Expo** — tooling & runtime for building, running, and deploying React Native apps.  
  Official website: https://expo.dev  
  Docs: https://docs.expo.dev
