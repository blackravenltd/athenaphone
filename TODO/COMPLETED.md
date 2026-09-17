# Completed

Newest first. One line per item on what actually shipped.

---

## 2026-09-16 — Four transports, and no system dialogs

- **SIP over UDP, TCP and TLS**, alongside the existing WebSocket. JsSIP only
  ships a WebSocket socket but does not require one -- its transport layer
  accepts anything implementing its `Socket` interface, so `src/sip/transports`
  provides the rest and `SipClient` picks one per account. This removes SIP
  over WebSocket as a hard requirement, which had ruled out most real servers.
- `UdpTransport`: a datagram is a message, so no framing. Warns above 1300
  bytes where fragmentation starts.
- `StreamTransport`: TCP and TLS share one implementation, because the framing
  problem is identical once the bytes are decrypted. Accumulates, finds the
  CRLFCRLF, reads Content-Length, and surfaces a message only when the body is
  complete -- counted in bytes, not characters. Handles RFC 5626 CRLF
  keep-alives. 11 tests cover split reads, coalesced reads, multibyte bodies
  and the compact `l:` header.
- Account form takes a transport picker, with the fields below it following
  the choice, and ports defaulting to the RFC-assigned ones. WS/WSS requires
  an explicit URI because RFC 7118 registers no port.
- **Removed every use of `Alert`.** `Dialog.alert`, `Dialog.confirm` and
  `Dialog.actions` queue through a store and are drawn by `DialogHost` at the
  root of the navigator, in the app's own language. The platform alert cannot
  be styled and differs by platform in button order and capability.

## 2026-09-16 — Restyled on macha-client-rn, and running on hardware

- Rebuilt the design system on `macha-client-rn` rather than `toms/dashboard`:
  its neutral ground and surface ramp, its spacing, radius and type scales,
  and `TOUCH_TARGET` on every control. The accent is green rather than
  Macha's crimson, because on a phone "answer" and "hang up" carry meaning a
  brand colour would throw away.
- Dropped the uppercase letterspaced label idiom throughout; headings and
  rows now use the plain type scale.
- Removed the Audiowide face entirely -- the file, the asset config, the
  Android assets copy, the `UIAppFonts` entry and the four Xcode project
  references. `react-native-asset -u` does not unlink, so this was by hand.
  Body text is the platform face: Roboto on Android.
- Replaced the pill navbar with a docked bottom nav carrying real icons and a
  missed-call badge, sitting above the safe-area inset.
- Added a hand-drawn 24-grid icon set following Macha's `icon(path)` factory,
  so there is no icon font in the bundle. The call screen's three-letter
  abbreviations ("Mic", "Spk", "Trn") are now glyphs.
- Built and installed on a Blackview A85 (Android 12, arm64) over wireless
  ADB, found by mDNS after the classic 5555 port turned out to be closed.

**Fixed while getting it onto the device**

- `react-native-callkeep` is incompatible with RN 0.87's New Architecture: it
  exports `displayIncomingCall` and `startCall` as two `@ReactMethod`
  overloads each, and the TurboModule interop layer rejects duplicate method
  names, so the whole module failed to load and every CallKit and
  ConnectionService path was dead. Fixed by de-annotating the 3-argument
  overloads, which the JS never calls on Android, via a `patch-package` patch
  with a `postinstall` hook.
- `colors.xml` had `--bg` inside an XML comment, which is illegal and failed
  `packageDebugResources`.

**Learned**

- 2talk, the first real account tried, is UDP-only and has no WebSocket
  listener. See TODO/ACTIVE.md -- it moves the native SIP transport from a
  nice-to-have to the thing that decides which servers this app can talk to.

## 2026-09-16 — Project scaffold and working core

**Project setup**

- React Native 0.87.1 scaffold via `@react-native-community/cli`, bare
  workflow with checked-in `ios/` and `android/` directories, TypeScript
  throughout.
- Chose bare RN CLI over Expo for unrestricted native access to CallKeep,
  PushKit and audio-session control.
- Chose JsSIP over SIP.js for its track record with react-native-webrtc.
  Confined to `src/sip/SipClient.ts` so it stays replaceable.
- MIT licence, README documenting the WebSocket-only transport constraint up
  front, and this TODO folder.
- `npm run check` runs typecheck, lint and tests together.

**SIP engine** (`src/sip`)

- `SipClient`: UA lifecycle, registration with automatic reconnection, and
  translation of JsSIP session events into a `Call` model.
- Outbound and inbound calls, audio and video, with multiple concurrent legs.
- Hold/resume, mute, camera enable and switch, mid-call upgrade to video.
- DTMF over RFC 2833 or SIP INFO; blind transfer and attended transfer via
  REFER.
- JsSIP termination causes mapped to a `CallEndReason` the UI can explain.
- Local media tracks stopped and released on every termination path, so the
  camera and microphone indicators clear.

**Platform integration** (`src/services`)

- `CallKeepService`: CallKit and Android ConnectionService, self-managed, so
  calls reach the lock screen. Falls back to in-app UI when the phone account
  is unavailable rather than failing.
- `CallController`: the single seam between SIP, telecom and audio. Keeps
  `SipClient` free of platform concerns and the stores free of SIP.
- `AudioService`: in-call audio mode, routing, proximity sensor, ringtone and
  ringback. Defers to CallKit's `didActivateAudioSession` on iOS.
- `CredentialStore`: SIP passwords in the keychain/keystore, never in
  AsyncStorage and never in the serialised account.
- `PermissionsService`: microphone, camera, Bluetooth and notifications, with
  the microphone treated as the only hard requirement for a call.

**State** (`src/store`)

- Zustand stores for accounts, calls, history, contacts and settings, each
  persisted through a JSON layer whose reads never throw.
- Settings hydrate over defaults, so a blob written by an older build does not
  leave new keys undefined.

**Interface**

- Dialer with a full keypad, long-press for `+` and voicemail, and a live
  registration indicator.
- Call screen with remote video, local picture-in-picture, in-call keypad,
  and controls for mute, hold, speaker, transfer, camera and video upgrade.
- Recents with missed-call tracking, tap to redial, long-press to remove.
- Contacts with search, favourites and a cross-platform add prompt.
- Settings with account management and per-feature toggles; a full account
  editor covering identity, transport and advanced SIP options.
- Styled to match the `toms/dashboard` visual language: dark-only palette,
  layered surfaces, uppercase letterspaced labels, status dots with the fault
  pulse, cards with a status-coloured left edge, and the pill navbar. Tokens
  ported directly from that stylesheet. Audiowide bundled and linked.

**Branding**

- Adopted the project owl mark. Cleaned the Inkscape export down to a single
  path, dropped the editor metadata, and tightened the viewBox from the A4
  page onto the artwork's own bounds, computed from the path data so nothing
  clips. Path data itself is verbatim.
- Inlined as an `SvgXml` string rather than an imported `.svg`, following
  `macha-client-rn`. No Metro transformer needed, and it renders under Jest
  unconfigured. `react-native-svg-transformer` was installed and then removed
  once this approach was settled on.
- `Screen`: shared chrome giving every screen the mark on the left of the top
  bar and the watermark behind the content, replacing five hand-rolled
  headers. The call screen drops the watermark whenever remote video is up.
- Source SVG kept white and standalone-usable; the in-app copy uses
  `currentColor` so it takes its colour from the theme.

**Native configuration**

- Android manifest: SIP, media, Bluetooth, telecom and foreground-service
  permissions; CallKeep's `VoiceConnectionService`; `tel:`/`sip:` intent
  filters; show-when-locked on the main activity.
- Forced-dark Android theme so launches do not flash white.
- iOS `Info.plist`: microphone, camera and contacts usage strings, VoIP and
  audio background modes, SiriKit call intents, `sip:`/`tel:` URL schemes, and
  arbitrary loads left off.

**Testing**

- Jest configured for the RN 0.87 preset with mocks for every native module
  the app touches at import time, including a hand-written async-storage mock
  after v3 dropped its own.
- 17 tests covering SIP URI handling, duration formatting and the typed
  emitter, plus an app render smoke test.
- The smoke test caught a real bug: react-navigation invokes the `tabBar` prop
  as a plain function, so passing `TabBar` directly broke its hooks. Fixed to
  render it as an element.
