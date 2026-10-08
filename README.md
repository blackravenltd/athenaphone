# AthenaPhone

An open source, standards-compliant SIP softphone for Android. Audio and video
calls to any SIP server you choose, with no proprietary components and no
hosted service in the middle. Built with React Native,
[JsSIP](https://jssip.net) and
[react-native-webrtc](https://github.com/react-native-webrtc/react-native-webrtc).

> **Status: working on Android, not yet released.** Registration, inbound and
> outbound audio and video calls, hold, mute, DTMF, blind transfer, history
> and contacts work on a real phone, against servers that offer WebRTC
> media. Commodity SIP providers, which offer plain RTP, do not work yet; a
> move to the [PJSIP](https://www.pjsip.org) engine to fix that is under way.
> The code also targets iOS, but it has never been built there. Open work is
> in [`TODO/ACTIVE.md`](TODO/ACTIVE.md).

AthenaPhone has a sibling project, [AthenaSIP](https://github.com/blackravenltd/athenasip),
an open source SIP server. They are developed and tested together, but
AthenaPhone is not tied to it: it aims to work with any standards-compliant
server or provider.

## Put it on a phone

You need Node 20+, JDK 17, the Android SDK and an Android 7 (API 24) or newer
phone with USB or wireless debugging on.

```bash
npm install
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

That builds a standalone APK for current 64-bit phones; drop the
`-PreactNativeArchitectures` flag to build for every ABI. The release build is
signed with the debug key, so it installs over a debug build but is not fit
for distribution.

For development, run a debug build against Metro instead:

```bash
npm start
npm run android
```

A debug build loads its JavaScript from Metro on your computer, so the phone
needs `adb reverse tcp:8081 tcp:8081` for every adb session. Without it the
app closes about three seconds after launch with no error on screen.

## Set up an account

**Settings → Add account.** Pick the transport first; the port defaults to
5060 for UDP and TCP and 5061 for TLS. For a server whose certificate comes
from a private CA, paste the CA's PEM into **CA certificate**. Then tap the
account to make it active.

**Remain in background** (on by default) keeps the app running while an
account is online, with a notification, so calls arrive when it is not on
screen. Some phones still kill it: exempt AthenaPhone from battery
optimisation, and on Blackview and similar, lock it in the recent-apps view.

## Standards

| | |
| --- | --- |
| SIP | RFC 3261 over UDP, TCP and TLS; WebSocket per RFC 7118 |
| Authentication | Digest, MD5 (RFC 3261) |
| Registration | RFC 5626 outbound parameters (`+sip.instance`, `reg-id`) |
| Media | WebRTC: ICE, DTLS-SRTP, Opus, G.722, G.711 |
| DTMF | RFC 4733 by default, SIP INFO per account |
| Transfer | Blind, via REFER (RFC 3515) |

Known gaps, all in [`TODO/ACTIVE.md`](TODO/ACTIVE.md): no DNS SRV/NAPTR
(RFC 3263), no keep-alives or flow recovery (RFC 5626 4.4 and 4.5), the
Contact is always WebSocket-shaped, no plain RTP, and no push (RFC 8599).
Media is always WebRTC, so a server offering plain RTP/AVP will register the
phone and then get a 488.

## Security

- Passwords live in the Android Keystore via `react-native-keychain`, never
  in app storage.
- Prefer TLS or WSS. UDP, TCP and `ws://` send signalling in the clear.
- TLS verifies against the system trust store or the account's CA. There is
  no way to skip verification.
- Media is always encrypted (DTLS-SRTP).

## Development

```bash
npm run check              # typecheck, lint, unit tests
npm run test:integration   # SIP stack against the Asterisk fixture
npm run test:athenasip     # SIP stack and calls against an AthenaSIP node
```

The two live-server suites run the app's own SIP code from Node, no phone
needed; see [`test/README.md`](test/README.md).

**SIP trace:** Settings → Diagnostics → Verbose SIP logging writes every SIP
message, as sent and received, to the console. Capture it with
`adb logcat -s ReactNativeJS`.

**Layout:** `src/sip` is the SIP stack and knows nothing of the platform;
`src/store` is plain state and knows nothing of SIP;
`src/services/CallController.ts` joins the two and is where UI call actions
go. Screens should not import `sipClient` directly.

**Patches:** `patches/` is applied by `patch-package` on install. One makes
`react-native-callkeep` load under RN 0.87; the other fixes a JsSIP timer that
made it answer a quick re-INVITE with 482.

**Design:** dark only. The accent marks where you are, never approval; green,
amber and red mean state and nothing else. Answer and hang up stay green and
red in fixed positions. Dialogs are the app's own (`dialogStore`), not
`Alert`. Tokens are in [`src/theme`](src/theme/index.ts).

## Contributing

Issues and pull requests are welcome. Work happens on `develop`; `main`
tracks releases. Run `npm run check` before opening a PR.

## Licence

GNU GPLv3. See [LICENSE](LICENSE).

Copyright (C) 2026 Tom Cully
