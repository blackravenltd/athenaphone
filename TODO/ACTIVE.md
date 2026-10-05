# Active

Open work, in rough priority order. Move items to
[`COMPLETED.md`](COMPLETED.md) as they land, with a note on what actually
shipped.

---

## Where things stand

Current release **0.3.0**. `develop` is the working branch; `main` tracks
releases.

**Verified on hardware** (two Blackview A85s, Android 12), against three
AthenaSIP deployments and Asterisk:

- Asterisk fixture: registration with digest auth and an outbound audio call
  to extension 101 with two-way Opus over DTLS-SRTP, call timer, Android
  system call UI, hang-up and history.
- AthenaSIP (interop UAT, 2026-09-30, SIP over TCP on a non-standard port):
  registration; **inbound** calls delivered over the registration flow,
  presented by CallKeep, rung and answered; **outbound** calls; two-way audio
  heard at both ends in both directions; BYE from each end. Details in
  [`COMPLETED.md`](COMPLETED.md).
- Deployed AthenaSIP (corvus-fi-1, realm `10.35.1.20`, 2026-10-03):
  registration as `athenaphone` over TCP, UDP and TLS; a plain-RTP offer
  refused with 488 before ringing; the 407 challenge on an outbound INVITE
  over UDP; an inbound WebRTC call from the console softphone over TLS,
  with audio heard in both directions; an inbound **video** call from the
  same softphone, auto-answered with the camera, picture and voice both
  ways, on the release build. No call has been completed over UDP.
- Public AthenaSIP (`macnessa.athenasip.org`, behind NAT with rtpengine,
  2026-10-04): registration as `1003` over TLS and TCP from the internet
  side; inbound video calls from a headless browser through rtpengine,
  unbundled audio and video, test pattern rendered and moving, audio
  received.

**Verified by the harness**: registration over UDP, TCP, TLS and WS, plus bad
password, unreachable server and clean unregister, against Asterisk.
Against a live AthenaSIP node, in AthenaSIP's combined suite
(`npm run test:athenasip`, all passing in both media phases on 2026-10-05):
registration over UDP, TCP, TLS, WS and WSS, TLS refused when the node is
not signed by the trusted CA, the RFC 5626 outbound parameters, 401 for a
bad password, a clean unregister, the node's 555 for unknown RFC 8599 push
parameters, and re-registration after the node restarts.

**Never exercised at all**: iOS — never compiled, so every CallKit path is
unverified. Outbound video calls, and camera switching. DTMF, hold and
transfer end to end. Staying registered unattended for hours -- see below:
on 2026-10-04 it did not.

### Running things

```bash
npm run check                      # typecheck, lint, 62 unit tests. No Docker.
cd test/asterisk && docker compose up -d
npm run test:integration           # 7 tests against the fixture; skips if down
```

The fixture needs `./scripts/generate-certs.sh <address>` once, where the
address is whatever the client dials — `127.0.0.1` for the harness, the host's
LAN IP for a phone.

A release build for the phones, about 2 minutes incremental and 15 clean:

```bash
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb -s <device> install -r app/build/outputs/apk/release/app-release.apk
```

Over wireless adb the 44 MB install takes several minutes.

### Environment traps, all previously paid for

- **UDP does not survive Docker Desktop's NAT on macOS.** Registration works,
  then dies when the mapping ages out. Use TCP or TLS on macOS; `network_mode:
  host` works on Linux and in CI. See `test/asterisk/README.md`.
- **The A85s drop off adb.** Wireless debugging's port rotates, and the
  phone turns wireless debugging off when it sleeps for long or changes
  network. Find the port with `adb mdns services`; if nothing is advertised,
  someone has to wake the phone and turn wireless debugging back on. There
  are two: serial `A85EEA0000005410` (Tom's, usually 10.35.1.164) and
  `A85EEA0000005398` (usually 10.35.1.195, no account set up yet).
- **Both phones run release builds**, which need nothing on the Mac. A debug
  build fetches its JS from Metro via `localhost:8081`, so every adb session
  needs `adb reverse tcp:8081 tcp:8081`, and the forward is lost whenever
  the phone returns on a new port. Without it RN 0.87's bridgeless mode
  exits about three seconds after launch with no error screen: `am start -W`
  says `Status: ok` while `ps` shows nothing.
- **Debug only: hot reloads** used to leave stale registered SIP clients.
  Fixed (4fea45e), but a cold start after native changes is still needed.
- **Metro bundles are not warm.** First bundle after `npm start` takes about a
  minute; the phone shows "Bundling 99%" meanwhile.
- **No Xcode or CocoaPods** on the development machine, hence no iOS build.

## Now — the gaps that block trusting it

### Next session with the phone

Needs an A85 awake with wireless debugging on. Tom's phone has two accounts:
"AthenaSIP macnessa" (`1003@macnessa.athenasip.org`, active, on TCP at last
look) and "AthenaSIP corvus" (`athenaphone@10.35.1.20`, TLS with the test
CA). A browser video call to `1003` is run by the AthenaSIP session's
headless-browser spec; Tom answers. The checks already run are in
[`COMPLETED.md`](COMPLETED.md).

- [ ] **See the video-call toolbar working.** Shipped unverified on
      2026-10-04: during a video call the controls become one small,
      translucent, draggable bar (`VideoCallToolbar`). Check it draws, its
      buttons work, it can be dragged and stays on screen, and the keypad
      still opens full width. The test call that was meant to show it found
      the phone unregistered (next item).
- [ ] **Complete a call over UDP.** The authentication half is verified:
      INVITE, 407, ACK, INVITE with `Proxy-Authorization`, 100 Trying, both
      INVITEs fragmented and delivered on the LAN. Nobody answered, so it
      ended in 408; a 200 and audio over UDP are still unseen.
- [ ] **Find out why a ringing call was not auto-answered.** On 2026-10-03 a
      call that reached a stale, hot-reloaded copy of the app rang for 30
      seconds with auto-answer on. Stale copies no longer occur and every
      later call was auto-answered, so it may have been the stale copy alone
      -- unproven.

### Staying registered

The most important gap now: on 2026-10-04 the phone was unreachable for hours
without anyone noticing.

- [ ] **The Blackview memory cleaner kills the app, foreground service or
      not.** `BvApplockService` ("ClearMemoryTask") killed AthenaPhone at
      03:05 while its foreground service was up (`prcp FGS`,
      `whitelistApp = 0`). The process was later running again under a new
      PID with no registration: the REGISTER at 07:02 (Expires 600) was never
      refreshed, and a call at 09:56 got 480. The phone was asleep and in
      light doze at the time. Needed: prompt for exemption from battery
      optimisation (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`); on vendors with
      their own killer, send the user to its whitelist (on Blackview, lock
      the app in recents); register again after a reboot; and find out what
      restarted the process and why it did not register.
- [ ] **Watch the connection and re-register when it goes.** Flagged by Tom,
      2026-10-04. When the macnessa node restarted at 01:30 the phone's TLS
      connection died without the close ever reaching it (a NAT on the path),
      so the app sat "registered" on a dead flow: the node held the binding
      and answered 480. The refresh at 01:33 went into the dead connection,
      timed out, and left the account Offline with no retry. A close that
      arrives (corvus, on the LAN) is handled within two seconds. What the
      standards ask:
      - RFC 5626 4.4: keep each flow alive -- double CRLF on TCP and TLS,
        STUN on UDP -- and treat a missing pong, or a close, as the flow
        failing. `StreamTransport` answers the server's pings but sends none.
      - RFC 5626 4.5: on flow failure, re-register over a new flow with the
        same `+sip.instance` and `reg-id` after a randomised backoff.
      - A refresh that fails should be retried with backoff, not left as
        Offline until someone restarts the app.
      AthenaSIP answers double CRLF with CRLF on TCP and TLS, and STUN on
      UDP 5060, so there is a server to test against.
- [ ] **Network change handling.** Re-register on Wi-Fi to cellular, via
      `@react-native-community/netinfo` and `sipClient.refreshRegistration()`.
      Part of the same job as the item above.

### Everything else

- [ ] **iOS build.** Never compiled. Needs Xcode and CocoaPods, then
      `pod install`. Every CallKit path is unverified, and that is the half
      most likely to differ from Android.
- [ ] **Call tests in the harness**: INVITE/180/200/ACK/BYE, CANCEL races,
      hold and resume, DTMF, and the 486/503/603 outcomes that map to
      `CallEndReason`. Needs a WebRTC stack under Node for the SDP -- `werift`
      is the candidate, a new dev dependency awaiting Tom's word. Listed as
      todo in `test/athenasip`, where two UAs (1003, 1004) would call each
      other through the node; the same stack serves the Asterisk harness.
- [ ] **Media assertions.** Extension `101` plays a precise 1004 Hz tone:
      decode the RTP and assert the FFT peak, so a test cannot pass on silence
      or a half-negotiated stream. Same `werift` dependency.
- [ ] **Verify DTMF, hold and transfer** end to end. Extension `103` captures
      four digits and raises an AMI `UserEvent`, so the assertion can be that
      the *server* received them. `109` is music on hold, `110` a transfer
      target.
- [ ] **Place a video call**, and switch cameras during one. Answering one
      is verified, on the LAN and through rtpengine from the internet.
- [ ] **Set up the second A85** (`A85EEA0000005398`): it has the app and no
      account.
- [ ] **Register against a commodity provider**, so the fixture is not the only
      thing the app has ever spoken to. 2talk answers `OPTIONS` with `200 OK`
      on UDP 5060.
- [ ] **A release build that could be distributed.** `assembleRelease`
      works and runs on the A85 without Metro, but it is signed with the
      debug keystore and reports version 1.0 (versionCode 1) from
      `android/app/build.gradle`, not the version in `package.json`. Needs a
      real signing key, kept out of the repository, and the version wired
      through.
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
      answer 488; a node with rtpengine then re-offers WebRTC once, or
      skips the round trip when the account is set to `media_profile:
      webrtc`. A node on the builtin media engine (corvus-fi-1) can only
      relay what the caller offered, so there a plain-RTP caller simply
      gets our 488.
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
- [ ] **Attended transfer UI.** `CallController.attendedTransfer` and
      `startConsultationCall` exist but nothing drives them.
- [ ] **Call waiting.** A second inbound call needs a swap, merge, or
      end-and-answer choice.
- [ ] **Three-way conferencing**, most practically via a server-side bridge.
- [ ] **Audio-route picker.** `AudioService.listRoutes` and `selectRoute`
      exist; the call screen only toggles the speaker.

## Known defects

Small, specific, and each independently fixable.

- [ ] **The whole app works over the lock screen.** `MainActivity` has
      `showWhenLocked` and `turnScreenOn`, meant for incoming calls, so
      waking a locked phone can bring up AthenaPhone with its accounts,
      settings and dialler usable without unlocking. Show the incoming-call
      screen over the lock screen and nothing else -- set the flags only
      while a call is ringing or up, or move the call UI to its own activity.

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
      below about 24pt. The notification icon (`ic_stat_athenaphone`) is the
      full mark as a white silhouette and reads as a blob; it and the top bar
      at 1x want a simplified silhouette.
- [ ] **Light theme**, if it turns out to be wanted. Deliberately omitted —
      the shared AthenaSIP palette is dark-only.
- [ ] **Landscape and tablet layouts.**

## Deliberate decisions, not omissions

Recorded so they are not "fixed" by mistake.

- **Dark only.** The shared palette has no light variant.
- **The accent marks position, never approval.** Green, amber and red are
  reserved for state. Nothing decorative may use them. See the README.
- **Call controls stay conventional** — answer green, hang up red — because
  they are telephony affordances, not branding. Positions are fixed except
  in a video call, where Tom asked (2026-10-04) for the controls to become
  one small bar that can be dragged off the picture.
- **`StreamTransport` reads a missing `Content-Length` as an empty body.** RFC
  3261 requires it on a stream transport, so a peer omitting it is broken, but
  being lenient beats desynchronising the stream.
- **No `Alert`.** All dialogs are drawn by the app; see `dialogStore`.
