# Active

Work not yet done, roughly in priority order. Move items to
[`COMPLETED.md`](COMPLETED.md) as they land, with a note on what actually
shipped.

---

## Now — prove it against real servers

The code compiles, lints and passes its tests, but **no call has completed end
to end**. Everything else is speculation until this is done.

- [x] **Bring up the Asterisk fixture.** Verified 2026-09-17: all four
      transports answer SIP, TLS verifies, both WebSocket listeners complete
      the handshake, and AMI accepts a login.
- [x] **Register against it** from the app. Verified 2026-09-17 on UDP and
      TCP, with digest auth.
- [x] **Place and answer an audio call.** Verified: extension 101, Opus over
      DTLS-SRTP, 1604 packets sent and 1613 received in 32 seconds with
      negligible loss. Call timer, system call UI, hang-up and call history
      all correct.
- [ ] **Register on TLS and WSS** as well. Only UDP and TCP are proven.
- [ ] **Assert the Milliwatt tone**, rather than just observing that RTP
      flows. Needs RTP capture and an FFT, which belongs in the automated
      harness rather than a manual run.
- [ ] **Register against a commodity provider** too, so the fixture is not the
      only thing the app has ever spoken to. 2talk answers SIP `OPTIONS` with
      `200 OK` on UDP 5060, so it is reachable; the device account needs
      moving from WSS to UDP.
- [ ] **Place and answer a video call.** Verify the remote view, the local
      picture-in-picture and camera switching.
- [ ] **Verify DTMF** — extension `103` captures four digits and reads them
      back, and raises an AMI `UserEvent` so the test can assert the server
      received them rather than trusting the display.
- [ ] **Verify hold and resume.** Check the re-INVITE, and that `a=sendonly`
      and `a=inactive` are handled in both directions.
- [ ] **Verify blind transfer** (REFER) reaches the right destination.
- [ ] **Interoperability matrix.** Fidelity is the point of the project, so
      register and complete a call against each of Asterisk (the fixture),
      FreeSWITCH, Kamailio, AthenaSIP and a commodity provider. Exercise every
      transport against at least one. Record what each needs in the README.
- [ ] **Plain-RTP interop.** AthenaPhone's media is always WebRTC -- DTLS-SRTP
      with ICE -- even over UDP signalling, so a server offering plain RTP/AVP
      will register fine and then fail to establish media. Endpoint `1003` in
      the fixture is the control case. Decide whether to carry a plain-RTP
      path or to document the requirement.
- [ ] **iOS build.** Never compiled — the development machine has no Xcode or
      CocoaPods. Every CallKit path is unverified.

## Found during the first hardware run (2026-09-17)

- [x] **Outbound calls crashed the app.** CallKeep's `VoiceConnectionService`
      calls `TelecomManager.getPhoneAccount()`, which throws
      `SecurityException` without `READ_PHONE_NUMBERS` -- inside a system
      service callback, so it is uncatchable from JS and kills the process.
      The permission was declared but never requested at runtime. Fixed, and
      CallKeep is now gated on the grant.
- [ ] **Verify the runtime permission prompt on a clean install.** The fix
      was exercised with the permission already granted via adb, so the
      request path itself is unproven.
- [ ] **The Bluetooth prompt interrupts the first call.**
      `requestForCall` asks for `BLUETOOTH_CONNECT` at dial time, so the first
      call a user places stops on a permission dialog. Ask at setup instead.
- [ ] **The call button is not debounced.** A second tap while the first call
      is being placed starts a second call, and Android then asks whether to
      end the first. Disable it until the call leaves `connecting`.
- [ ] **Adding an account does not select it.** A new account is saved as
      `Inactive` and has to be tapped separately, which reads like the save
      failed.
- [ ] **A long registration error crowds out the account name.** `Row`'s
      `meta` needs a width cap so the title always survives.

## Next — automated testing

The fixture makes manual verification possible; these make it repeatable.

- [ ] **Make the transports take an injectable socket factory.** Both already
      define their socket surface as an internal interface, so this is small —
      and it lets the whole SIP layer run under Node with `dgram`/`net`, which
      is what makes everything below possible without a device.
- [ ] **Signalling tests in Node** against the fixture: REGISTER with digest
      auth, re-REGISTER on expiry, the INVITE/180/200/ACK/BYE sequence, CANCEL
      races, and the 486/503/603 outcomes that map to `CallEndReason`.
- [ ] **Media assertions**, using `werift` for WebRTC under Node so RTP
      actually flows, and an FFT against extension `101`.
- [ ] **CI.** Signalling tests need no containers and can run on every commit;
      the fixture works on GitHub Actions' Linux runners.
- [ ] **Inbound call tests.** Everything above tests the app as caller. Have
      the fixture originate to `1001` to exercise ringing and CallKeep.
- [ ] **Device smoke test** with Maestro against the same fixture, for the
      paths only hardware exercises: CallKeep, ConnectionService, audio
      routing.

## Next — SIP correctness

These are the gaps that will bite during the matrix above.

- [ ] **DNS SRV and NAPTR resolution (RFC 3263).** A client is supposed to
      resolve `_sip._udp.<domain>` and friends to find the server and port,
      not assume the domain is the host. AthenaPhone dials the domain
      directly, which is wrong wherever the two differ.
- [ ] **Failover** between SRV targets, and to the next transport when one is
      unreachable.
- [ ] **NAT traversal for the non-WebSocket transports.** Via `rport` and
      `received` get responses back, but Contact still advertises a private
      address, so in-dialog requests can be misrouted. Needs `rport` handling
      plus a STUN-discovered Contact, or connection reuse (RFC 5626).
- [ ] **TCP fallback for oversized messages.** RFC 3261 section 18.1.1
      requires switching to a congestion-controlled transport as a request
      approaches the MTU. `UdpTransport` warns above 1300 bytes but still
      sends, so a large INVITE with video SDP can fragment.
- [ ] **Digest authentication edge cases** — `qop=auth-int`, stale nonces, and
      re-authentication mid-dialog, against more than one server.
- [ ] **Codec selection.** Opus/G.722/PCMU ordering and a video bandwidth cap,
      via SDP munging in `SipClient`. Matters for interop: some servers offer
      only G.711.

## Then — daily-driver gaps

- [ ] **Push notifications.** Calls only arrive while the app is running and
      registered. Needs PushKit on iOS, FCM high-priority data messages on
      Android, and a push gateway (RFC 8599 REGISTER parameters).
- [ ] **Background registration on Android** — a foreground service to hold
      the connection open, plus battery-optimisation prompting.
- [ ] **Network change handling.** Re-register on a Wi-Fi to cellular switch,
      via `@react-native-community/netinfo` and
      `sipClient.refreshRegistration()`.
- [ ] **Attended transfer UI.** `CallController.attendedTransfer` and
      `startConsultationCall` exist but nothing drives them.
- [ ] **Call waiting.** A second inbound call while one is active needs a
      proper swap, merge, or end-and-answer choice.
- [ ] **Three-way conferencing**, most practically via a server-side bridge.
- [ ] **Audio-route picker.** `AudioService.listRoutes` and `selectRoute`
      exist, but the call screen only toggles the speaker.

## Commercial-phone parity

- [ ] **BLF / presence** — SUBSCRIBE/NOTIFY for `dialog` and `presence`, with
      a busy-lamp-field speed dial page.
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
- [ ] **Structured SIP logging.** The `verboseSipLogging` setting exists but
      is not honoured. Hook it to JsSIP's `debug` and add a log viewer.
- [ ] **CI** — GitHub Actions running `npm run check`, plus release builds.
- [ ] **Accessibility pass.** Labels exist on the main controls; needs a real
      screen-reader run and a check of dialpad hit targets.

## Design

- [ ] **Replace the mark at small sizes.** The owl's feather strokes merge
      below about 24pt; a simplified silhouette is needed for the top bar at
      1x and for the Android notification icon.
- [ ] **Light theme**, if it turns out to be wanted. Deliberately omitted.
- [ ] **Landscape and tablet layouts.**

## Known rough edges

- `startVideoMuted`, `autoSpeakerOnVideo` and `vibrateOnRing` are stored and
  shown in Settings but not yet read by `CallController`.
- `SipClient.upgradeToVideo` adds a track and renegotiates, but there is no
  downgrade path to remove video from a call.
- Contacts are add-and-delete only: no edit screen, and only the first number
  is dialable.
- `AudioService.listRoutes` offers Bluetooth unconditionally on Android,
  because `react-native-incall-manager` cannot enumerate devices. Selecting it
  is a no-op when nothing is paired.
- `StreamTransport` reads a missing `Content-Length` as an empty body. RFC
  3261 requires it on a stream transport, so a peer omitting it is broken, but
  being lenient beats desynchronising the stream.
