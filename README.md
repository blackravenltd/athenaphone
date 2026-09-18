# AthenaPhone

An open source, fully featured SIP softphone for iOS and Android, with video
calling. Built with React Native, [JsSIP](https://jssip.net) and
[react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc).

The goal is parity with a commercial desk phone or softphone — registration,
audio and video calls, hold, transfer, conferencing, DTMF, call history,
contacts, and proper integration with the platform call UI — with no
proprietary components and no hosted service in the middle. You point it at
your own SIP server and it is yours.

> **Status: early.** Registration over four transports, audio and video
> calling, hold, mute, blind transfer, DTMF, history and contacts are
> implemented, and the project compiles, lints and tests clean. **No call has
> yet completed against a live PBX.** What is missing, and what is next, is in
> [`TODO/ACTIVE.md`](TODO/ACTIVE.md).

## Transports

AthenaPhone speaks SIP over **UDP, TCP, TLS and WebSocket**. The aim is
fidelity to the standards and interoperability with the servers people
actually run, rather than a tie to any one implementation.

| Transport | Default port | Notes |
| --- | --- | --- |
| UDP | 5060 | Universally supported, and the default for a new account. Credentials travel in the clear. |
| TCP | 5060 | No datagram size limit, so large INVITEs carrying video SDP are safe. Still unencrypted. |
| TLS | 5061 | Encrypted signalling. Preferred wherever the server supports it. Accepts a CA PEM for a private or self-signed certificate. |
| WS / WSS | none | SIP over WebSocket (RFC 7118) registers no port, so these accounts must give the full URI. |

JsSIP ships only a WebSocket socket, but it does not require one: its
transport layer accepts anything implementing its `Socket` interface.
[`src/sip/transports`](src/sip/transports) supplies the rest.

- **`UdpTransport`** — one datagram is one SIP message, so there is no framing
  to do.
- **`StreamTransport`** — TCP and TLS, which do need framing. A stream has no
  message boundaries, so it accumulates bytes, finds the CRLFCRLF ending the
  headers, reads `Content-Length`, and surfaces a message only once its whole
  body has arrived — counted in bytes, not characters. Covered by
  [`__tests__/streamTransport.test.ts`](__tests__/streamTransport.test.ts).

### Relationship to AthenaSIP

[AthenaSIP](https://github.com/blackravenltd/athenasip) is a sibling project —
a SIP server — and the two are intended to ship together. That does not make
AthenaPhone an AthenaSIP client. It has to work properly against Asterisk,
FreeSWITCH, Kamailio and commodity providers first; AthenaSIP is one target
among those rather than the one that sets the defaults.

## Requirements

- Node 20 or newer (developed on Node 24)
- Watchman (`brew install watchman`)
- **Android:** JDK 17, Android SDK, a device or emulator on API 24+
- **iOS:** Xcode 16+, CocoaPods, and a real device for calls — the simulator
  has no camera and unreliable audio capture
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

Then open **Settings → Add account**. Choose the transport first: the fields
below it follow from that choice, and the port defaults to the RFC-assigned
one for UDP, TCP and TLS.

## Project layout

```
src/
  sip/            JsSIP wrapper. The only place that imports jssip.
    transports/   UDP, TCP and TLS sockets for JsSIP.
  services/       Platform glue: CallKeep, audio routing, permissions, storage.
  store/          Zustand stores. Plain state, no SIP or platform knowledge.
  screens/        Dialer, Call, Recents, Contacts, Settings, Account.
  components/     Shared UI, including Screen, the dialogs and the icon set.
  navigation/     Tab and stack navigators.
  theme/          Design tokens.
  hooks/          Shared React hooks.
  utils/          Pure helpers: SIP URI handling, ids, the typed emitter.
  assets/         The mark, inlined for SvgXml.
```

The layering is deliberate and worth preserving:

- **`src/sip`** knows SIP and nothing else — no CallKit, no audio session, no
  persistence.
- **`src/store`** holds plain application state and does not know SIP exists.
- **`src/services/CallController.ts`** is the only module that knows about
  both, and is where call actions from the UI are routed.

If you find yourself importing `sipClient` into a screen, that is the seam
telling you the logic belongs in `CallController` instead.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm test
npm run check       # all three, as CI runs them
```

### Testing against a real server

[`test/asterisk`](test/asterisk) is a disposable Asterisk fixture serving all
four transports at once, with a dialplan of single-purpose test extensions —
echo, a 1004 Hz reference tone, DTMF capture and readback, busy, no-answer,
hold and a transfer target — plus AMI so tests can assert on what the server
saw rather than only on what the app displayed.

```bash
cd test/asterisk
cp .env.example .env          # the address your device reaches this host on
./scripts/generate-certs.sh <that address>
docker compose up --build
```

Register as `1001` / `athenaphone`. See
[`test/asterisk/README.md`](test/asterisk/README.md) for the extension table.

With the fixture up, the integration harness runs the real SIP stack against
it from Node — no device, no emulator:

```bash
npm run test:integration
```

Only the sockets are swapped, for Node's `dgram`, `net` and `tls`; everything
above them is the code that ships. See
[`test/integration/README.md`](test/integration/README.md).

### Patches

`npm run postinstall` applies [`patches/`](patches) via `patch-package`. The
one patch there de-annotates two duplicate `@ReactMethod` overloads in
`react-native-callkeep`, which RN 0.87's TurboModule interop rejects — without
it the module fails to load and every CallKit and ConnectionService path is
dead.

## Design

Dark-only, on the shared AthenaSIP palette — adopted from
[athenasip-admin](https://github.com/blackravenltd/athenasip-admin), whose
structure in turn comes from the sibling `macha-client-rn` client: a near-black
ground, a layered surface ramp, a three-step text ramp, and a minimum 44pt
touch target on every control. Tokens are in
[`src/theme`](src/theme/index.ts).

**The rule that governs the palette: the accent marks position, never
approval.** Accent is for where you are and what you are about to act on — the
focused control, the primary action. Green, amber and red are reserved for
state a reader must not have to interpret, and nothing decorative may use
them. This app previously used green as both accent and "ok", which made it
read as relentlessly green; confining green to state makes it carry
information again.

The accent is blue-steel because AthenaSIP has no brand colour to inherit —
its logo is monochrome — and because steel leaves green and red free to mean
something.

**Call controls are the exception, and deliberately so.** Answer and hang up
are telephony affordances, not branding: answer is the same green as
"registered", hang up is a saturated red. They are far apart in luminance
(0.41 against 0.21) and differ in more than hue — answer carries dark content,
hang up light — so they stay distinguishable for the red/green colour vision
deficiency that would otherwise make them the worst possible pair. Position
does the primary work: answer left, hang up right, never swapped between
screens.

**Dialogs.** The app never uses `Alert`. The platform alert cannot be styled,
looks like a different application on top of this one, and differs between
iOS and Android in button order and capability — `Alert.prompt` is iOS-only.
[`src/store/dialogStore.ts`](src/store/dialogStore.ts) provides
`Dialog.alert`, `Dialog.confirm` and `Dialog.actions`, drawn by `DialogHost`
at the root of the navigator, with `PromptModal` for text entry.

**Icons** are hand-drawn on a 24-unit grid rather than an icon font, which
keeps a whole typeface out of the bundle. Body text uses the platform face.

**The mark** is an owl — Athena's. It appears small at the left of the top bar
and again as a faint watermark behind the content, except on the call screen
once remote video is up, where drawing over the picture would be a defect.
`assets/logo/athenaphone-mark.svg` is the design source;
`src/assets/athenaMark.ts` is the copy the app renders, inlined for `SvgXml`
so no Metro transformer is needed. `scripts/generate-icons.sh` rasterises the
app icons, and is the only place in the project that turns a vector into a
bitmap.

## Security notes

- SIP passwords are stored with `react-native-keychain`
  (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), never in AsyncStorage and never in the
  serialised account object.
- Prefer TLS or WSS. The app accepts UDP, TCP and `ws://` because they are
  what most servers offer and lab setups need them, but on those your
  credentials and signalling are in the clear.
- TLS uses the system trust store unless an account supplies a CA PEM. There
  is no option to skip certificate verification.
- `NSAllowsArbitraryLoads` is off; local networking is permitted so that
  private-network PBXs work.
- Media is DTLS-SRTP encrypted by WebRTC. Signalling security is whatever the
  transport gives you.

## Contributing

Issues and pull requests are welcome. Work happens on `develop`; `main` tracks
released versions. Please run `npm run check` before opening a PR, and add to
[`TODO/ACTIVE.md`](TODO/ACTIVE.md) if you start on something sizeable so
effort is not duplicated.

## Licence

GNU GPLv3. See [LICENSE](LICENSE).

Copyright (C) 2026 Tom Cully
