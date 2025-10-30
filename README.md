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

## File Descriptions

## App Structure (Expo Router)

### `app/(auth)/`

Route group for authentication screens (public). Includes sign-in/sign-up flows powered by **Clerk**.

- **Purpose:** Show auth UI when the user is not signed in; redirect to `(root)` on success.

### `app/(root)/`

Route group for the main, signed-in experience (protected).

- **Purpose:** Has primary app features behind authentication.
- **Navigation:** Usually wrapped by a tab or stack layout in its own `_layout.tsx`.

### `app/_layout.tsx`

Global layout for the entire app directory (top-level).

- **What it does:** Configures the root navigation container (e.g., stacks/tabs), theme and shared providers (safe area, gesture handler, etc.).

## Main Screens (inside `app/(root)/`)

- **`app/(root)/index.tsx`**  
  Home/landing for signed-in users. Quick entry to camera/search and highlights (collections).

- **`app/(root)/camera.tsx`**  
  Camera capture screen. Takes a photo, forwards it to the RAG pipeline, and navigates to chat (e.g., `PhotoRAGChat` flow).

- **`app/(root)/chat/`**  
  Chat routes (e.g., `chat/[id].tsx` for a specific scan session).  
  Displays conversation history (text/voice) for a selected artwork scan.

- **`app/(root)/collections/`**  
  Collections browser. Lists museum collections and lets users drill down to artworks within each collection.

- **`app/(root)/museums/`**  
  Museum directory & details. Fetches museums, supports search and navigates into their collections.

- **`app/(root)/profile.tsx`**  
  User profile & settings. Shows Clerk account info and sign-out

- **services/api.ts**  
  Centralized API client for the mobile app. Uses `EXPO_PUBLIC_API_URL` and exposes typed fetchers:

  - `fetchMuseums({ query })` : list museums.
  - `fetchCollections(museumId)` : collections for a museum.
  - `fetchCollectionById(collectionId)` : a single collection with artworks.

- **services/useFetch.ts**  
  Lightweight React hook to execute any async function with state management. Tracks `data`, `loading`, `error`, and provides `refetch()` and `reset()`. Supports optional auto-fetch on mount (`autoFetch = true`).

- **lib/museumApi.ts**  
  Authenticated API client (hook) for the museum backend using Clerk tokens.

  - **Env**: `EXPO_PUBLIC_API_BASE_URL` (falls back to `http://192.168.1.100:8000`).
  - **Auth**: Adds `Authorization: Bearer <token>` or `X-Client-Auth` (alt header).
  - **Types**: `Neighbor`, `SearchDecision`, `SearchFullResponse`, `SearchImageParams`, `SourceChunk`, request/response payloads for chat & voice.
  - **Image search**: `searchImageFromUri(photoUri, params?)` : POST `/search-image` with `FormData`.
  - **Text chat**: `postChat(payload)` : POST `/chat` (JSON).
  - **Voice chat (TTS/ASR)**:
    - `postVoiceChat(payload)` : POST `/voice/chat` (FormData fields).
    - `postVoiceChatFromFile({ audioUri, ... })` : POST `/voice/chat` with audio file.
  - **Returns**: A hook `useMuseumApi()` that exposes the above functions ready to use in components.

- **components/PhotoRAGChat.tsx**  
  Camera result chat sheet that analyzes a captured photo, identifies the artwork, and lets users chat (text or voice) about it.

  - **What it does:**
    - Uploads the captured image to the backend (`useMuseumApi().searchImageFromUri`) and shows the top match & artist name.
    - Renders a draggable bottom sheet with intro bubble, suggested prompts, message list, and input bar.
    - Sends text questions to the backend (`postChat`) and displays answers.
    - Opens a voice chat modal (`<VoiceRAGChat />`) for spoken Q&A and logs turns to the transcript list.
    - Handles keyboard-aware layout, smooth spring animations, and pull-up/pull-down gestures with `PanResponder`.
  - **Props:**
    - `photo: CameraCapturedPicture` : image from the camera (expects `base64` for preview).
    - `onOpenCamera?()` / `handleRetakePhoto?()` : return to camera to retake.
    - `onMicPress?()` : optional hook when mic is tapped.
    - `onSendMessage?(msg: string)` : callback when a text message is sent.
  - **Key states & logic:**
    - Maintains `messages`, `loading/error`, `search` result, and `scanId`.
    - Auto-runs search on mount; shows “No Match” card with retry/retake actions if needed.
    - Dynamic sheet heights for intro vs. active conversation; auto-scroll to the latest message.
  - **Depends on:**
    - `lib/museumApi` (`searchImageFromUri`, `postChat`)
    - `components/VoiceRAGChat` for voice turns
    - `expo-router`, `react-native-safe-area-context`, `@expo/vector-icons`

- **components/VoiceRAGChat.tsx**  
  Voice chat UI that records the user, sends audio to the backend, plays the spoken answer, and auto resumes listening.

  - **What it does:**
    - Records microphone input with Expo AV, uses simple VAD (metering + silence timeout) to auto-stop.
    - Submits audio via `useMuseumApi().postVoiceChatFromFile`, receives transcript + TTS audio, plays the reply, then switches back to listening.
    - Shows dynamic mic state: **Listening → Processing → Playing** with pulse animation and mute/cancel controls.
    - Handles iOS/Android audio mode switching for clean record/playback.
  - **Props:**
    - `visible` (boolean): show/hide the voice sheet.
    - `onClose`() : close callback.
    - `scanId` (string): current scan/session id (required).
    - `artworkId?`, `artistId?`, `voiceId?` (strings): context for the voice chat request.
    - `bottomPadding?` (number): extra safe-area padding.
    - `onAnswer?`(text), `onVoiceTurn?`(transcript, answer): callbacks to surface results to parent UI.
  - **Phases:**
    - `listening` (with VAD + mute toggle), `processing` (sending/awaiting), `playing` (TTS reply playback).
  - **Depends on:**
    - `expo-av` for audio record/playback, `@expo/vector-icons` for icons, `useMuseumApi` for backend calls, and a helper `playBase64Audio`.

- **components/ChatHistory.tsx**  
  Paginated list of past artwork chats with images and timestamps.
  - **What it does:**
    - Fetches `/chat/history?limit=25&offset=…` from the backend using a Clerk bearer token (`useAuth().getToken()`), driven by `EXPO_PUBLIC_API_BASE_URL`.
    - Normalizes S3 image URLs (path-style to virtual-hosted) for reliable thumbnail loading.
    - Renders items in a `FlatList` with pull-to-refresh, infinite scroll (onEndReached), and loading/error/empty states.
    - Taps navigate to a detail route: `/chat/[id]` via `expo-router`.
    - Formats “last message” time with `Intl.DateTimeFormat`.
  - **Key types & UI:**
    - `ChatItem` shape includes `scan_id`, titles, `artwork_image_url`, and timestamps.
    - `ChatRow` memoized row showing thumbnail, title, and last activity time.
  - **Depends on:**
    - `@clerk/clerk-expo` (auth token), `expo-image` (thumbnails), `expo-router` (navigation), React Native `FlatList/RefreshControl`.
