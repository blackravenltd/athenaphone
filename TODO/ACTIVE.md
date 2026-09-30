# Active

Open work, in rough priority order. Move items to
[`COMPLETED.md`](COMPLETED.md) as they land, with a note on what actually
shipped.

---

## Where things stand

Current release **0.2.1**. `develop` is the working branch; `main` tracks
releases.

**Verified on hardware** (Blackview A85, Android 12): registration with digest
auth, and an audio call to the fixture's extension 101 carrying two-way Opus
over DTLS-SRTP, with call timer, Android system call UI, hang-up and history.

**Verified by the harness**: registration over UDP, TCP, TLS and WS, plus bad
password, unreachable server and clean unregister.

**Never exercised at all**: iOS — never compiled, so every CallKit path is
unverified. Video calls. DTMF, hold and transfer end to end. Inbound calls.

### Running things

```bash
npm run check                      # typecheck, lint, 35 unit tests. No Docker.
cd test/asterisk && docker compose up -d
npm run test:integration           # 7 tests against the fixture; skips if down
```

The fixture needs `./scripts/generate-certs.sh <address>` once, where the
address is whatever the client dials — `127.0.0.1` for the harness, the host's
LAN IP for a phone.

### Environment traps, all previously paid for

- **UDP does not survive Docker Desktop's NAT on macOS.** Registration works,
  then dies when the mapping ages out. Use TCP or TLS on macOS; `network_mode:
  host` works on Linux and in CI. See `test/asterisk/README.md`.
- **The A85's wireless-debugging port rotates**, and the phone sleeps. Find it
  with `adb mdns services`; if `adb connect` times out, ping the phone first to
  wake it, then retry the same port.
- **The app on the phone is a debug build** and fetches its JS from Metro on
  the development machine. It shows "Unable to load script" without it. A
  release build is needed for standalone use — see below.
- **No Xcode or CocoaPods** on the development machine, hence no iOS build.

## Now — the gaps that block trusting it

- [ ] **iOS build.** Never compiled. Needs Xcode and CocoaPods, then
      `pod install`. Every CallKit path is unverified, and that is the half
      most likely to differ from Android.
- [ ] **Call signalling tests in the harness**: INVITE/180/200/ACK/BYE, CANCEL
      races, and the 486/503/603 outcomes that map to `CallEndReason`. Needs a
      WebRTC stack under Node for the SDP — `werift` is the candidate. This
      unlocks most of what is currently only checkable by hand.
- [ ] **Media assertions.** Extension `101` plays a precise 1004 Hz tone:
      decode the RTP and assert the FFT peak, so a test cannot pass on silence
      or a half-negotiated stream. Same `werift` dependency.
- [ ] **Verify DTMF, hold and transfer** end to end. Extension `103` captures
      four digits and raises an AMI `UserEvent`, so the assertion can be that
      the *server* received them. `109` is music on hold, `110` a transfer
      target.
- [ ] **Place and answer a video call**: remote view, local
      picture-in-picture, camera switching.
- [ ] **Inbound calls.** Everything so far tests the app as caller. Have the
      fixture originate to `1001` to exercise ringing and CallKeep.
- [ ] **Register against a commodity provider**, so the fixture is not the only
      thing the app has ever spoken to. 2talk answers `OPTIONS` with `200 OK`
      on UDP 5060.
- [ ] **Release build**, so the app works without Metro. Check the signing
      config first.
- [ ] **CI.** Unit tests and lint need nothing; the fixture runs on GitHub
      Actions' Linux runners, where UDP also works properly.

## SIP correctness

The gaps that will bite during any interoperability work.

- [ ] **DNS SRV and NAPTR resolution (RFC 3263).** A client resolves
      `_sip._udp.<domain>` to find the server and port rather than assuming the
      domain is the host. AthenaPhone dials the domain directly, which is wrong
      wherever the two differ.
- [ ] **Failover** between SRV targets, and to the next transport when one is
      unreachable.
- [ ] **NAT traversal for the non-WebSocket transports.** `rport` and
      `received` get responses back, but Contact still advertises a private
      address, so in-dialog requests can be misrouted. Needs a STUN-discovered
      Contact, or connection reuse (RFC 5626). Servers without
      `rewrite_contact` cannot reach us at all.
- [ ] **Plain-RTP interop.** Media is always WebRTC — DTLS-SRTP with ICE —
      even over UDP signalling, so a server offering plain RTP/AVP registers
      fine and then fails to establish media. Fixture endpoint `1003` is the
      control case. Decide: carry a plain-RTP path, or document the
      requirement.
- [ ] **TCP fallback for oversized messages.** RFC 3261 18.1.1 requires
      switching to a congestion-controlled transport near the MTU.
      `UdpTransport` warns above 1300 bytes but still sends, so a large INVITE
      with video SDP can fragment.
- [ ] **Digest authentication edge cases** — `qop=auth-int`, stale nonces,
      re-authentication mid-dialog, against more than one server.
- [ ] **Codec selection.** Opus/G.722/PCMU ordering and a video bandwidth cap,
      via SDP munging. Some servers offer only G.711.
- [ ] **Interoperability matrix.** Register and complete a call against
      Asterisk, FreeSWITCH, Kamailio, AthenaSIP and a commodity provider.
      Exercise every transport against at least one. Record what each needs.

## Daily-driver gaps

- [ ] **Push notifications.** Calls only arrive while the app is running and
      registered. PushKit on iOS, FCM high-priority data on Android, and a push
      gateway (RFC 8599 REGISTER parameters).
- [ ] **Background registration on Android** — a foreground service to hold the
      connection open, plus battery-optimisation prompting.
- [ ] **Network change handling.** Re-register on Wi-Fi to cellular, via
      `@react-native-community/netinfo` and `sipClient.refreshRegistration()`.
- [ ] **Attended transfer UI.** `CallController.attendedTransfer` and
      `startConsultationCall` exist but nothing drives them.
- [ ] **Call waiting.** A second inbound call needs a swap, merge, or
      end-and-answer choice.
- [ ] **Three-way conferencing**, most practically via a server-side bridge.
- [ ] **Audio-route picker.** `AudioService.listRoutes` and `selectRoute`
      exist; the call screen only toggles the speaker.

## Known defects

Small, specific, and each independently fixable.

- [ ] **The Bluetooth prompt interrupts the first call.** `requestForCall`
      asks for `BLUETOOTH_CONNECT` at dial time, so the first call a user
      places stops on a permission dialog. Ask at setup instead.
- [ ] **Adding an account does not select it.** It saves as `Inactive` and has
      to be tapped separately, which reads like the save failed.
- [ ] **A long registration error crowds out the account name.** `Row`'s `meta`
      needs a width cap so the title survives.
- [ ] **Verify the runtime permission prompt on a clean install.** The
      `READ_PHONE_NUMBERS` fix was exercised with the permission already
      granted via adb, so the request path itself is unproven.
- [ ] `startVideoMuted`, `autoSpeakerOnVideo` and `vibrateOnRing` are stored
      and shown in Settings but never read by `CallController`.
- [ ] `SipClient.upgradeToVideo` adds a track and renegotiates, but there is no
      downgrade path to remove video from a call.
- [ ] Contacts are add-and-delete only: no edit screen, and only the first
      number is dialable.
- [ ] `AudioService.listRoutes` offers Bluetooth unconditionally on Android,
      because `react-native-incall-manager` cannot enumerate devices.
      Selecting it is a no-op when nothing is paired.

## Commercial-phone parity

- [ ] **BLF / presence** — SUBSCRIBE/NOTIFY for `dialog` and `presence`, with a
      busy-lamp-field speed dial page.
- [ ] **Message waiting indication** — SUBSCRIBE to `message-summary`.
- [ ] **Device contacts**, merged with the local list. Permission is already
      requested.
- [ ] **Multiple simultaneous registrations.** The store holds many accounts
      but `SipClient` runs one UA.
- [ ] **SIP MESSAGE chat.** The `message:received` event is emitted and goes
      nowhere.
- [ ] **Provisioning** from a URL or QR code, so nobody types a WebSocket URI
      by hand.
- [ ] **Call recording**, with the legal warnings that implies.
- [ ] **Do not disturb**, and time-based call rules.

## Quality

- [ ] **Tests for `SipClient`** — mock the JsSIP `UA` and cover the session
      state machine, particularly `reasonFor()` and the `finish()` guard
      against double-termination.
- [ ] **Tests for `CallController`** — the CallKeep and audio interaction is
      the most fragile part of the app and has no coverage.
- [ ] **Error surfacing.** `SipClient` emits an `error` event nothing listens
      to. Wire it to the dialog host or a diagnostics screen.
- [ ] **Structured SIP logging.** The `verboseSipLogging` setting exists but is
      not honoured. Hook it to JsSIP's `debug` and add a log viewer.
- [ ] **Accessibility pass.** Labels exist on the main controls; needs a real
      screen-reader run and a check of dialpad hit targets.
- [ ] **WSS in the harness.** JsSIP's WebSocket transport uses the global
      `WebSocket`, which takes no CA, so it cannot verify the fixture's
      self-signed certificate. `NODE_EXTRA_CA_CERTS` covers it.

## Design

- [ ] **Replace the mark at small sizes.** The owl's feather strokes merge
      below about 24pt; a simplified silhouette is needed for the top bar at 1x
      and for the Android notification icon.
- [ ] **App icons from the mark** are done for Android and iOS, but the
      notification icon is still the default.
- [ ] **Light theme**, if it turns out to be wanted. Deliberately omitted —
      the shared AthenaSIP palette is dark-only.
- [ ] **Landscape and tablet layouts.**

## Deliberate decisions, not omissions

Recorded so they are not "fixed" by mistake.

- **Dark only.** The shared palette has no light variant.
- **The accent marks position, never approval.** Green, amber and red are
  reserved for state. Nothing decorative may use them. See the README.
- **Call controls stay conventional** — answer green, hang up red, fixed
  positions — because they are telephony affordances, not branding.
- **`StreamTransport` reads a missing `Content-Length` as an empty body.** RFC
  3261 requires it on a stream transport, so a peer omitting it is broken, but
  being lenient beats desynchronising the stream.
- **No `Alert`.** All dialogs are drawn by the app; see `dialogStore`.
