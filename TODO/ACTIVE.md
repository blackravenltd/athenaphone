# Active

Open work, in rough priority order. Move items to
[`COMPLETED.md`](COMPLETED.md) as they land, with a note on what actually
shipped.

---

## Where things stand

Current release **0.2.1**. `develop` is the working branch; `main` tracks
releases.

**Verified on hardware** (Blackview A85, Android 12), against two servers:

- Asterisk fixture: registration with digest auth and an outbound audio call
  to extension 101 with two-way Opus over DTLS-SRTP, call timer, Android
  system call UI, hang-up and history.
- AthenaSIP (interop UAT, 2026-09-30, SIP over TCP on a non-standard port):
  registration; **inbound** calls delivered over the registration flow,
  presented by CallKeep, rung and answered; **outbound** calls; two-way audio
  heard at both ends in both directions; BYE from each end. Details in
  [`COMPLETED.md`](COMPLETED.md).

**Not yet run against the deployed AthenaSIP** (corvus-fi-1, realm
`10.35.1.20`, since 2026-10-02). The account exists and the checks are
listed under "Next session with the phone" below.

**Verified by the harness**: registration over UDP, TCP, TLS and WS, plus bad
password, unreachable server and clean unregister.

**Never exercised at all**: iOS — never compiled, so every CallKit path is
unverified. Video calls. DTMF, hold and transfer end to end.

### Running things

```bash
npm run check                      # typecheck, lint, 49 unit tests. No Docker.
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
  the development machine via `localhost:8081`, so every adb session -- USB or
  wireless -- needs `adb reverse tcp:8081 tcp:8081` first. Without it RN 0.87's
  bridgeless mode does not show the red "Unable to load script" screen: it
  tears the host down and the process exits about three seconds after launch.
  `am start -W` reporting `Status: ok` while `ps` shows nothing is the
  signature. A release build is needed for standalone use — see below.
- **Metro bundles are not warm.** First bundle after `npm start` takes about a
  minute; the phone shows "Bundling 99%" meanwhile.
- **No Xcode or CocoaPods** on the development machine, hence no iOS build.

## Now — the gaps that block trusting it

### Next session with the phone

Everything here needs the A85 in hand and is otherwise ready. The deployed
AthenaSIP node is `10.35.1.20`: UDP and TCP 5060, TLS 5061, plain WS 8088.
The phone's account is `athenaphone@10.35.1.20`, already set to
`media_profile: webrtc` on the server; Tom enters the password on the device.

- [ ] **Register as `athenaphone` over TCP** and take an inbound call. The
      first INVITE should carry `UDP/TLS/RTP/SAVPF` with a fingerprint and ICE
      credentials, with no 488 before it.
- [ ] **Watch a 488-then-reoffer call.** For an account *not* marked WebRTC,
      AthenaSIP now offers plain RTP, takes our 488, and offers WebRTC once.
      Each rejected offer builds and tears down a CallKeep connection; check
      it leaves no ring blip and no stray missed-call entry, and tell the
      AthenaSIP session either way.
- [ ] **Place a call over UDP.** AthenaSIP challenges every INVITE with 407
      (RFC 3261 22.3) unless it arrives on a TCP, TLS or WebSocket connection
      the caller registered over. JsSIP's `RequestSender` answers 401 and 407
      alike when the UA holds a password, so this should work but has never
      run: the trace should show INVITE, 407, INVITE with
      `Proxy-Authorization`, 200. Expect fragmentation -- with the STUN
      default the INVITE is about 2340 bytes -- and look there first if it
      fails.
- [ ] **Register over TLS.** The node's certificate is signed by AthenaSIP's
      own test CA, so the account needs that CA's PEM
      (`tls/ca/snakeca.crt` in the athenasip repo; the public certificate
      only).

### Everything else

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
- [ ] **Contact is a WebSocket Contact on every transport.** Registering over
      TCP we send `Contact: <sip:...@d00dk4jg2ruo.invalid;transport=ws>` --
      an unresolvable host (RFC 6761) and the wrong transport -- because
      JsSIP's WebSocket Contact leaks onto the sockets in
      `src/sip/transports`. A registrar that routes by the registration flow
      (RFC 5626; we send `+sip.ice`, `reg-id` and `+sip.instance`) never
      reads it, which is why AthenaSIP could reach us. One that resolves it
      cannot reach us at all, and even a flow-routing one loses us the moment
      the connection blips, until re-registration. Confirmed on the wire.
- [ ] **Every account defaults to Google's STUN server** --
      `accountDefaults.iceServers`. The README promises "no hosted service in
      the middle"; this is one, on by default. Observed effect on a LAN-only
      call: `c=IN IP4 <public address>` and two `srflx` candidates disclosing
      the device's public Wi-Fi and cellular addresses to a server one hop
      away, and a 2340-byte INVITE that would fragment on UDP. Decide: drop
      the default, or keep it and say so in the README and the account form.
- [ ] **Audio focus is refused on outbound calls.** `InCallManager` logs
      `requestAudioFocus(): usage=CALL, res=AUDIOFOCUS_REQUEST_FAILED` when we
      start audio immediately after `CallKeepService.reportOutgoing`, while
      Telecom is still switching audio modes; inbound gets it granted. Playout
      still ran, so this is latent rather than broken, but it is the sort of
      thing that surfaces as silence on another device. Start audio after
      Telecom settles, or on the ConnectionService's audio-state callback.
- [ ] **We do not send `rport`.** `UdpTransport`'s doc comment says we set it;
      on the JsSIP TCP path our Via carries only a branch. Either send it or
      correct the comment.
- [ ] **NAT traversal for the non-WebSocket transports.** Beyond the Contact
      bug above: needs a STUN-discovered Contact, or connection reuse
      (RFC 5626). Servers without `rewrite_contact` cannot reach us at all.
- [ ] **Plain-RTP interop.** Media is always WebRTC — DTLS-SRTP with ICE —
      even over UDP signalling, so a server offering plain RTP/AVP registers
      fine and then fails to establish media. Fixture endpoint `1003` is the
      control case. Decide: carry a plain-RTP path, or document the
      requirement. Against AthenaSIP it is handled server-side: the default
      realm policy guesses from the transport (WebSocket means WebRTC,
      anything else plain RTP), so we are offered RTP/AVP on TCP or UDP and
      answer 488; the node then re-offers WebRTC once, or skips the round
      trip when the account is set to `media_profile: webrtc`.
- [ ] **TCP fallback for oversized messages.** RFC 3261 18.1.1 requires
      switching to a congestion-controlled transport near the MTU.
      `UdpTransport` warns above 1300 bytes but still sends. With the STUN
      default above an audio-only INVITE is already 2340 bytes, so this is not
      only a video problem.
- [ ] **Answer OPTIONS with our capabilities.** We register no `newOptions`
      listener, so JsSIP replies with a bare `200` and no body. RFC 3261 11.2
      says the response SHOULD carry the SDP an INVITE would be answered
      with. AthenaSIP can probe registered clients with OPTIONS (off by
      default, `behaviour.qualify_interval` per realm) and will make its
      first offer WebRTC if our 200 carries WebRTC SDP -- which would remove
      the 488-and-reoffer round trip it otherwise needs to reach us on TCP or
      UDP. A static body is enough and can be honest: AthenaSIP (from its
      commit 58dfb65) reads WebRTC from a `UDP/TLS/RTP/SAVPF` m-line alone, so
      the reply needs the m-line, a `c=` line and our codecs -- no
      fingerprint, no ICE attributes, no peer connection per probe.
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
- [ ] **A log viewer in the app.** `verboseSipLogging` now drives `sipTrace`,
      which captures raw SIP in both directions at the socket and holds the
      last 500 messages, but the only way to read it is Metro or `adb logcat`.
      `sipTrace.dump()` and `dumpSdp()` want a diagnostics screen and a share
      sheet, so a trace can come off a device with no cable attached.
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
