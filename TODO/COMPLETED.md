# Completed

Newest first. One entry per milestone, recording what actually shipped.

---

## Unreleased — 2026-10-03, device checks against the deployed AthenaSIP

The A85 against corvus-fi-1 (realm `10.35.1.20`, AthenaSIP's builtin media
engine, which relays the caller's offer and cannot convert it), registered
as subscriber `athenaphone`.

**Verified:**

- **Registration over TCP, UDP and TLS**, the last on 5061 with AthenaSIP's
  test CA in the account.
- **An inbound WebRTC call**, from the admin console's softphone as `1001`,
  over TLS. First INVITE `UDP/TLS/RTP/SAVPF` with fingerprint and ICE
  credentials, no 488; auto-answered; ICE and DTLS on host candidates, media
  direct between browser and phone; a mid-call UPDATE answered; BYE from the
  browser; audio heard in both directions. The first attempt was silent one
  way because the Mac's microphone input was a loopback device.
- **The 407 challenge on an INVITE over UDP**: INVITE, 407, ACK, INVITE with
  `Proxy-Authorization`, 100 Trying. The call itself was not answered.

**Shipped from it:**

- **A plain-RTP offer is refused before it rings.** It used to get 180, a
  half-second flash of the system call screen, then 488 and a missed call in
  Recents. `SipClient` now refuses inside `newRTCSession`, before the 180,
  unless the offer has a DTLS-keyed audio stream with a fingerprint
  (`canAnswerOffer`, `src/utils/sdp.ts`). Confirmed on the device.
- **No 482 to a quick re-offer.** AthenaSIP ACKed our 488 and re-offered on
  a new branch 8 ms later; JsSIP still listed the first transaction, because
  its zero Timer I is a `setTimeout(0)`, took the re-INVITE for a merged
  request and answered 482 Loop Detected. `patches/jssip+3.13.8.patch` ends
  the transaction when the ACK is processed. Covered by
  `__tests__/jssipTimerI.test.ts`, which fails if the patch is lost; not
  re-run on the device, since corvus-fi-1 no longer re-offers.
- **A hot reload no longer leaves the old SIP client registered.** Each
  Metro reload kept the previous `SipClient` and its socket, so after two
  edits three copies were registered and a call went to a stale one. In
  debug builds the previous client is now silenced and stopped when its
  replacement is created. Confirmed on the device: one unregister, one
  register, status shown correctly.
- **The CA certificate field holds a PEM.** It was single-line.

**Found on the AthenaSIP side, fixed there:** the node's re-offer after a
488 repeated the same plain-RTP offer; behind the builtin engine it now
passes the 488 back instead.

**Left in `ACTIVE.md`:** a completed call over UDP; TLS refused without the
CA; why one ringing call was not auto-answered.

## Unreleased — 2026-09-30, AthenaSIP interop UAT

First calls against anything other than the Asterisk fixture, on the
Blackview A85 over SIP/TCP to an AthenaSIP node with rtpengine on the media
path. Outcome: registration, inbound and outbound calls, two-way audio heard
at both ends in both directions, BYE from each end. Recorded as passed.

**Shipped from it:**

- **A SIP trace that exists.** The "Verbose SIP logging" toggle had been wired
  to nothing. `src/sip/SipTrace.ts` now wraps the JsSIP socket at
  `createSocket`, so every transport is traced by construction: raw messages
  both directions, byte-counted, digest `response=` redacted, chunked under
  logcat's 4 kB truncation, with `dump()` and `dumpSdp()` for the artefact.
  Plus `[media]` lines per call -- ICE, DTLS and connection state changes and
  a 2 s stats line with the selected candidate pair, RTP packets each way and
  received and sent audio energy. It was the instrument the evening ran on.
- **Android rings on inbound calls.** A SELF_MANAGED ConnectionService draws
  the call UI and never rings; the app deferred to it and was silent. The
  first UAT call timed out unanswered because of this. Fixed, together with
  the `stopRingtone` that `handleEnded` was missing, which the fix would
  otherwise have turned into a ringtone that outlives a missed call.
- **Outbound INVITEs no longer wait ~40 s for ICE gathering.** JsSIP holds
  the offer until gathering completes; with the Google STUN default and Wi-Fi
  plus cellular up, that took long enough to read as "stuck on Calling".
  `SipClient` now sends once candidates have been quiet for 500 ms.
- **Call history cannot hold two rows with one key.** `recordCall` replaces
  by id and `hydrate` de-duplicates what an older build persisted.
- **No keep-alive warning on every TCP connect** -- `react-native-tcp-socket`
  ignores the delay parameter and said so each time.

**Found and left in `ACTIVE.md`:** the `.invalid;transport=ws` Contact on
non-WebSocket transports; the Google STUN default and what it discloses;
audio focus refused on outbound calls; no `rport`.

**The silent call, for the record.** Every early call rang, connected and
carried the phone's audio one way; the caller's leg sat at four packets. It
was blamed on Docker Desktop's NAT (a true observation -- the engine sees the
browser via a peer-reflexive candidate at Docker's gateway -- that was not
the cause, since the same NAT is present when a call works), then on the two
legs being unalike. The cause was in AthenaSIP: `DTLS=passive` sent to
rtpengine on the answer as well as the offer reset a handshake the engine had
already begun as the active side toward the caller. Any call that rang for
more than a few hundred milliseconds lost the caller's leg; auto-answering
automation never rang long enough to see it. The lead was that the
four-packet signature followed whichever leg had sent the offer, the phone's
included. Four reproductions with no working case to compare against showed
that something was broken, not what; one browser-to-browser control with a
real ring time did. Environment traps met on the way are in `ACTIVE.md`.

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
