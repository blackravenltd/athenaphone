# Completed

Newest first. One entry per milestone, recording what actually shipped.

---

## 0.1.0 — 2026-09-16

The initial build: a working SIP softphone that compiles, lints and tests
clean, but has not yet completed a call against a live PBX.

### Foundation

- React Native 0.87.1, bare workflow with checked-in `ios/` and `android/`,
  TypeScript throughout.
- Bare RN CLI over Expo, for unrestricted native access to CallKeep, PushKit
  and audio-session control.
- JsSIP over SIP.js, for its track record with react-native-webrtc. Confined
  to `src/sip` so it stays replaceable.
- GPLv3, matching AthenaSIP.
- `npm run check` runs typecheck, lint and tests together.

### Transports

SIP over **UDP, TCP, TLS and WebSocket**. JsSIP ships only a WebSocket socket
but does not require one — its transport layer accepts anything implementing
its `Socket` interface — so `src/sip/transports` supplies the rest and
`SipClient` picks one per account.

- `UdpTransport`: a datagram is a message, so no framing. Warns above 1300
  bytes, where fragmentation starts.
- `StreamTransport`: TCP and TLS share one implementation, because the framing
  problem is identical once the bytes are decrypted. Accumulates, finds the
  CRLFCRLF, reads Content-Length, and surfaces a message only when the body is
  complete — counted in bytes, not characters. Handles RFC 5626 CRLF
  keep-alives.
- Ports default to the RFC-assigned 5060/5060/5061. WS and WSS require an
  explicit URI, because RFC 7118 registers no port and every implementation
  picks differently.

### SIP engine

- UA lifecycle, registration with automatic reconnection, and translation of
  JsSIP session events into a `Call` model.
- Outbound and inbound calls, audio and video, with multiple concurrent legs.
- Hold/resume, mute, camera enable and switch, mid-call upgrade to video.
- DTMF over RFC 2833 or SIP INFO; blind and attended transfer via REFER.
- Termination causes mapped to a `CallEndReason` the UI can explain.
- Local media tracks stopped and released on every termination path, so the
  camera and microphone indicators clear.

### Platform integration

- `CallKeepService`: CallKit and Android ConnectionService, self-managed, so
  calls reach the lock screen. Falls back to in-app UI when the phone account
  is unavailable rather than failing.
- `CallController`: the single seam between SIP, telecom and audio, keeping
  `SipClient` free of platform concerns and the stores free of SIP.
- `AudioService`: in-call audio mode, routing, proximity sensor, ringtone and
  ringback. Defers to CallKit's `didActivateAudioSession` on iOS.
- `CredentialStore`: SIP passwords in the keychain, never in AsyncStorage.
- `PermissionsService`: microphone treated as the only hard requirement.
- Android manifest and iOS `Info.plist` carry the permissions, background
  modes, telecom service and URL schemes a phone needs.

### Interface

- Dialer, in-call screen with picture-in-picture video, recents, contacts,
  settings, and a full account editor with a transport picker.
- Dark-only, on `macha-client-rn`'s design system: its surface and text ramps,
  spacing, radius and type scales, and `TOUCH_TARGET` on every control. The
  accent is green rather than Macha's crimson, because on a phone "answer" and
  "hang up" carry meaning a brand colour would throw away.
- Docked bottom nav with a hand-drawn 24-grid icon set rather than an icon
  font, and a missed-call badge.
- **No platform alerts anywhere.** `Dialog.alert`, `Dialog.confirm` and
  `Dialog.actions` queue through a store and are drawn by `DialogHost` at the
  root of the navigator, with `PromptModal` for text entry.
- The owl mark, small in the top bar and as a faint watermark behind content —
  dropped on the call screen once there is remote video to cover.
- App icons: a VectorDrawable adaptive icon on Android API 26+, so nothing is
  rasterised there; PNGs only where the platform leaves no choice.

### Testing

- Jest configured for the RN 0.87 preset with mocks for every native module
  the app touches at import time, including a hand-written async-storage mock
  after v3 dropped its own.
- 28 tests: SIP URI handling, duration formatting, the typed emitter, stream
  framing, and an app render smoke test.

### Fixed along the way

- **`react-native-callkeep` could not load at all under RN 0.87.** It exports
  `displayIncomingCall` and `startCall` as two `@ReactMethod` overloads each,
  and the New Architecture's TurboModule interop rejects duplicate method
  names, so every CallKit and ConnectionService path was dead. Fixed by
  de-annotating the 3-argument overloads, which the JS never calls on Android,
  via a `patch-package` patch with a `postinstall` hook.
- The app render test caught react-navigation invoking the `tabBar` prop as a
  plain function, which broke hooks inside the tab bar component.
- `colors.xml` had `--bg` inside an XML comment, which is illegal and failed
  `packageDebugResources`.

### Verified on hardware

Built and installed on a Blackview A85 (Android 12, arm64) over wireless ADB.
The app launches, renders and reports registration failure correctly. No call
has been placed yet.
