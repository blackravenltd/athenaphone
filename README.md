# AthenaPhone

An open source, fully featured SIP softphone for iOS and Android, with video
calling. Built with React Native, [JsSIP](https://jssip.net) and
[react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc).

The goal is parity with a commercial desk phone or softphone: registration,
audio and video calls, hold, transfer, conferencing, DTMF, call history,
contacts, and proper integration with the platform call UI — with no
proprietary components and no hosted service in the middle. You point it at
your own PBX and it is yours.

> **Status: early.** The core is in place — registration over four
> transports, audio and video calls, hold, mute, blind transfer, DTMF,
> history and contacts — and it compiles, lints and tests clean. It has not
> yet completed a call against a live PBX. See
> [`TODO/ACTIVE.md`](TODO/ACTIVE.md) for what is next.

---

## Transports

AthenaPhone speaks SIP over **UDP, TCP, TLS and WebSocket**. The goal is
fidelity to the standards and interoperability with the SIP servers people
actually run, not a tie to any one implementation.

| Transport | Default port | Notes |
| --- | --- | --- |
| UDP | 5060 | Universally supported, and the default for a new account. Credentials travel in the clear. |
| TCP | 5060 | No datagram size limit, so large INVITEs with video SDP are safe. Still unencrypted. |
| TLS | 5061 | Encrypted signalling. Preferred wherever the server supports it. Takes a CA PEM for a private or self-signed certificate. |
| WS / WSS | none | SIP over WebSocket (RFC 7118) registers no port, so an account must give the full URI. |

JsSIP only ships a WebSocket socket, but it does not require one: its
transport layer accepts anything implementing its `Socket` interface.
`src/sip/transports` provides the other three —

- `UdpTransport` — one datagram is one SIP message, so there is no framing.
- `StreamTransport` — TCP and TLS, which do need framing. A stream has no
  message boundaries, so it accumulates bytes, finds the CRLFCRLF ending the
  headers, reads Content-Length, and surfaces a message only once its whole
  body has arrived. Counted in bytes, not characters. Covered by
  `__tests__/streamTransport.test.ts`.

### Relationship to AthenaSIP

[AthenaSIP](https://github.com/blackravenltd/athenasip) is a sibling project —
a SIP server — and the two are intended to ship together. That does not make
AthenaPhone an AthenaSIP client: it has to work properly against Asterisk,
FreeSWITCH, Kamailio and commodity SIP providers first, and AthenaSIP is one
target among those rather than the one that sets the defaults.

## Features

**Working today**

- SIP registration over UDP, TCP, TLS or WebSocket, with automatic
  reconnection and re-REGISTER when the app returns from the background
- Audio and video calls, inbound and outbound
- Upgrade an audio call to video mid-call, with camera switching
- Hold and resume, mute, speaker and audio-route selection
- DTMF via RFC 2833 or SIP INFO, with an in-call keypad
- Blind transfer, and the plumbing for attended transfer
- CallKit (iOS) and ConnectionService (Android) integration, so calls appear
  on the lock screen and survive backgrounding
- Multiple accounts, with passwords held in the iOS keychain / Android keystore
- Call history with missed-call tracking, and a local contact list
- STUN/TURN configuration per account

**Planned** — see [`TODO/ACTIVE.md`](TODO/ACTIVE.md) for the full list, but the
headline items are push notifications for calls while the app is closed,
three-way conferencing, attended-transfer UI, BLF/presence, and message
waiting indication.

---

## Requirements

- Node 20 or newer (developed on Node 24)
- Watchman (`brew install watchman`)
- **Android:** JDK 17, Android SDK, an emulator or device on API 24+
- **iOS:** Xcode 16+, CocoaPods, a real device for calls
  (the simulator has no camera and unreliable audio capture)
- A SIP server reachable over UDP, TCP, TLS or WebSocket

## Getting started

```bash
npm install

# iOS only
bundle install
bundle exec pod install --project-directory=ios

npm start            # Metro
npm run android      # or: npm run ios
```

Then open **Settings → Add account** and fill in your PBX details. Pick the
transport first — the fields below it follow from that choice, and the port
defaults to the RFC-assigned one.

## Project layout

```
src/
  sip/          JsSIP wrapper. The only place that imports jssip.
  sip/transports/  UDP, TCP and TLS sockets for JsSIP.
  services/     Platform glue: CallKeep, audio routing, permissions, storage.
  store/        Zustand stores. Plain state, no SIP or platform knowledge.
  screens/      Dialer, Call, Recents, Contacts, Settings, Account.
  components/   Shared UI primitives, including Screen and the logo.
  assets/       The mark, inlined for SvgXml.
  navigation/   Tab and stack navigators.
  theme/        Design tokens.
  hooks/        Shared React hooks.
  utils/        Pure helpers: SIP URI handling, ids, the typed emitter.
```

The layering is deliberate and worth preserving:

- **`src/sip`** knows SIP and nothing else. No CallKit, no audio session, no
  persistence.
- **`src/store`** holds plain application state. It does not know SIP exists.
- **`src/services/CallController.ts`** is the only module that knows about
  both, and it is where call actions from the UI are routed.

If you find yourself importing `sipClient` into a screen, that is the seam
telling you something belongs in `CallController` instead.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test
npm run check       # all three, as CI runs them
```

## Design

The interface follows the same visual language as the `toms/dashboard`
project: a dark-only palette, layered surfaces, uppercase letterspaced
section labels, status dots, and cards with a status-coloured left edge.
Tokens live in [`src/theme/index.ts`](src/theme/index.ts) and are ported
directly from that stylesheet, so the two read as one family.

### Dialogs

The app never uses `Alert`. The platform alert cannot be styled, looks like a
different application on top of this one, and differs between iOS and Android
in button order and capability — `Alert.prompt` is iOS-only. Instead
[`src/store/dialogStore.ts`](src/store/dialogStore.ts) offers `Dialog.alert`,
`Dialog.confirm` and `Dialog.actions`, drawn by `DialogHost` at the root of
the navigator, plus `PromptModal` for text entry.

### The mark

AthenaPhone's mark is an owl — Athena's owl. It appears twice on every
screen, following the same pattern as `macha-client-rn`: small on the left of
the top bar, and again as a faint watermark behind the content at 3.5%
opacity.

- `assets/logo/athenaphone-mark.svg` is the design source, filled white so it
  is usable on its own.
- `src/assets/athenaMark.ts` is the copy the app renders, inlined as a string
  for `SvgXml` and filled with `currentColor` so it can be tinted from the
  theme. Regenerate this from the SVG rather than editing the path by hand.

It is inlined as a string rather than imported as a `.svg` file specifically
to avoid needing a Metro transformer, which also keeps it renderable under
Jest with no extra configuration.

Both are drawn by [`src/components/Logo.tsx`](src/components/Logo.tsx), and
[`src/components/Screen.tsx`](src/components/Screen.tsx) is the shared chrome
that puts them on every screen. The call screen is the one exception: it drops
the watermark as soon as there is remote video, because drawing over the
picture is a defect rather than decoration.

## Security notes

- SIP passwords are stored with `react-native-keychain`
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), never in AsyncStorage and never in the
  serialised account object.
- `NSAllowsArbitraryLoads` is off. Local networking is permitted so that
  private-network PBXs work.
- Prefer TLS, or `wss://`. The app accepts UDP, TCP and `ws://` because they
  are what most servers offer and lab setups need them, but on those your
  credentials and signalling are in the clear.
- Media is DTLS-SRTP encrypted by WebRTC. Signalling security is whatever your
  transport gives you.

## Contributing

Issues and pull requests are welcome. Please run `npm run check` before
opening a PR, and add to `TODO/ACTIVE.md` if you start on something sizeable
so effort is not duplicated.

## Licence

MIT. See [LICENSE](LICENSE).
