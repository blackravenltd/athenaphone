# Completed

Newest first. One entry per milestone, recording what actually shipped.

---

## 0.2.1 — 2026-09-18

Adopted the shared AthenaSIP palette from athenasip-admin, along with the rule
that governs it: **the accent marks position, never approval.**

Green had been serving as both the accent and the `ok` state, so every
affirmative control -- call button, Save, Add account, Reconnect, toggles,
dialog confirms -- shared a hue with every healthy status, and accumulated on
every screen until it meant nothing. Eight controls moved onto blue-steel.
Green now appears only where it carries information: registered, favourite,
connected, and answering a call.

The accent is blue-steel because AthenaSIP has no brand colour to inherit --
its logo is monochrome -- and because steel leaves green and red free to mean
something. Ground, surfaces, text ramp, borders and semantics were taken
unchanged, so the two products match.

Call controls stay conventional, which the admin client recommended. Answer is
exactly its `--ok`; hang up is a saturated red rather than its light text red,
which is unreadable as a filled button. Red against green is the pair that
fails for the commonest colour vision deficiency, so hue does not carry it
alone: the two are far apart in luminance, answer carries dark content and
hang up light, and position is fixed across every screen.

Two contrast defects fixed, both found by measuring every pairing rather than
trusting the numbers:

- Interactive text at `#3d7fb5` gave 4.18:1 on `surface` and 3.70:1 on
  `surface2`. Lifted to `#4d8ec3`. The admin client rightly pointed out its own
  value was never failing -- there the token is only a ring or border, so the
  3:1 non-text bar applies. Here it is genuinely text, so 4.5:1 does.
- The faintest text step at `#77777f` gave 3.57:1 on `surface2`, and it is not
  decorative: it renders contact numbers, the account's user@host, the
  unselected transport labels, the remote party's URI mid-call and the
  inactive tab labels. Lifted to `#8a8a93`.

## 0.2.0 — 2026-09-17

**The first release that has actually made a call.**

Verified against Asterisk 20.6: registration with digest auth over UDP, TCP,
TLS and WebSocket, and an audio call carrying two-way Opus over DTLS-SRTP --
1604 packets sent, 1613 received in 32 seconds -- with the call timer, the
Android system call UI, hang-up and call history all behaving.

**`test/asterisk`** — a disposable Asterisk fixture serving all four
transports at once, with a dialplan of single-purpose extensions: echo, a 1004
Hz Milliwatt reference tone, DTMF capture and readback, busy, congestion,
ring-forever, delayed answer, decline, music on hold, a transfer target, and
app-to-app dialling. AMI lets a test assert what the server received rather
than what the app displayed.

**`test/integration`** — a harness running the real `SipClient` against that
fixture from Node. `src/sip/transports/sockets.ts` makes the sockets
injectable: the app installs the React Native ones, the harness installs
Node's `dgram`, `net` and `tls`. Everything above the socket is the code that
ships. Seven tests cover registration on every transport plus its failure
modes, in seconds.

**Critical actions are guarded.** `singleFlight()` and the
`useCriticalAction()` hook: one press does the action once, repeats during and
for a cooldown after are ignored, and `busy` drives the control's disabled
state. Dial, answer, decline, hang up, transfer, video upgrade, redial and
calling a contact all route through it.

### Bugs that only hardware found

- **Outbound calls crashed the app.** CallKeep's `VoiceConnectionService`
  calls `TelecomManager.getPhoneAccount()`, which throws `SecurityException`
  without `READ_PHONE_NUMBERS` -- inside a system service callback, where JS
  cannot catch it, so the process died on the first dial. The permission was
  declared but never requested at runtime.
- **Which permission to ask for depends on the API level**, and not obviously:
  react-native-callkeep's own manifest caps `READ_PHONE_STATE` at
  `maxSdkVersion 29`, and the merger applies that cap to ours. On API 30+ it
  is absent from the APK entirely, so requesting it could only ever fail and
  would have disabled CallKeep on every modern device.
- **One tap placed two calls.** Telecom echoes `RNCallKeep.startCall()` back
  as `didReceiveStartCallAction` -- the event meant for calls dialled from
  outside the app -- and acting on our own echo placed the call again. It also
  bypassed every in-flight guard, because it re-enters the controller directly
  and arrives about a second later.
- **`SipClient.stop()` returned before the transport closed.** JsSIP
  disconnects at once only when nothing is outstanding, and otherwise waits two
  seconds; since `start()` calls `stop()` first, switching account or transport
  briefly held two sockets.
- **`endAllCalls()` does not clear orphaned telecom connections.** It iterates
  a static map, empty in a fresh process. A connection left by a crash lives on
  in the system telecom service; recovery is to unregister the phone account
  and restart. Recorded in `CallKeepService`.

### Fixture problems worth remembering

Each presented as something other than what it was:

- Asterisk was removed from Debian bookworm, so the image is Ubuntu 24.04.
- `chan_sip` claims the `sip` WebSocket sub-protocol before
  `res_pjsip_transport_websocket` can, making that module decline to load and
  silently removing WebSocket support. It also competes for UDP 5060.
- Asterisk expands `${VAR}` in the dialplan but **not** in `pjsip.conf`, so
  the external address is rendered by the entrypoint with `envsubst`.
- Template inheritance is `[name](template)`; written as `templates = name`
  the objects never appear and nothing is logged.
- The AOR must be named for the user part being registered --
  `res_pjsip_registrar` looks it up by the To header, so any other name gives
  404 with endpoint and auth both correct.
- `rewrite_contact` is required for the non-WebSocket transports: JsSIP
  registers an unroutable `sip:<random>@<random>.invalid` Contact, so Asterisk
  could not deliver an inbound INVITE or even a BYE.
- A CA certificate without `keyUsage=keyCertSign` is rejected by modern TLS
  stacks with an error that reads like a server fault.

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
