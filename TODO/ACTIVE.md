# Active

Work not yet done, roughly in the order it should be tackled. Move items to
[`COMPLETED.md`](COMPLETED.md) as they land, with a one-line note on what
actually shipped.

---

## Now — get it onto a real PBX

Nothing below this heading has been tested against a live server. That is the
single biggest gap: the code compiles, lints and passes its tests, but no SIP
packet has left the app yet.

- [ ] **Register against a real PBX.** Now unblocked by the UDP/TCP/TLS
      transports. 2talk publishes `_sip._udp -> plus.2talk.co.nz:5060`, so the
      existing account is worth trying over UDP.
- [ ] **Interoperability matrix.** The point of the project is fidelity, so
      register and complete a call against each of: Asterisk (chan_pjsip),
      FreeSWITCH, Kamailio, and a commodity provider. Record what each needs
      in the README. Test every transport against at least one of them.
- [ ] **Place and answer an audio call end to end.** Verify two-way audio, the
      call timer, and that the audio session is released on hangup.
- [ ] **Place and answer a video call.** Verify the remote view, the local PiP
      and camera switching.
- [ ] **Verify DTMF.** RFC 2833 against an IVR, then the SIP INFO fallback.
- [ ] **Verify hold and resume.** Check the re-INVITE and that `a=sendonly` /
      `a=inactive` is handled in both directions.
- [ ] **Verify blind transfer** (REFER) reaches the right destination.
- [ ] **iOS build.** Xcode and CocoaPods are not installed on the current dev
      machine, so the iOS half is unverified — it has never been compiled.
      Run `pod install` and build before trusting any of the CallKit paths.

## Next — the gaps that stop it being a daily driver

- [ ] **Push notifications.** Calls only arrive while the app is running and
      registered. Needs PushKit + VoIP pushes on iOS, and FCM high-priority
      data messages on Android, with a server-side push gateway
      (`pn-provider` / RFC 8599 params on REGISTER).
- [ ] **Attended transfer UI.** `CallController.attendedTransfer` and
      `startConsultationCall` exist but nothing in the UI drives them. Needs a
      consultation call flow: hold, dial, talk, then complete or cancel.
- [ ] **Three-way conferencing.** Either local mixing or, more practically,
      server-side via a conference bridge extension.
- [ ] **Background registration on Android.** A foreground service to hold the
      WebSocket open, plus battery-optimisation exemption prompting.
- [ ] **Network change handling.** Re-register on a Wi-Fi to cellular switch.
      `@react-native-community/netinfo` plus `sipClient.refreshRegistration()`.
- [ ] **Call waiting.** A second inbound call while one is active currently
      just appears; it needs a proper swap/merge/end-and-answer UI.

## Then — commercial-phone parity

- [ ] **BLF / presence.** SUBSCRIBE/NOTIFY for `dialog` and `presence`, with
      a busy-lamp-field speed dial page.
- [ ] **Message waiting indication.** SUBSCRIBE to `message-summary`, show a
      voicemail badge.
- [ ] **Device contacts.** Read the platform address book and merge it with
      the local list. `react-native-contacts`, permission already requested.
- [ ] **Call recording**, with the legal warnings that implies.
- [ ] **Codec selection.** Opus/G.722/PCMU ordering, and a bandwidth cap for
      video. Requires SDP munging in `SipClient`. Matters for interop: some
      servers offer only G.711.
- [ ] **Digest authentication edge cases.** JsSIP handles the common path;
      verify `qop=auth-int`, stale nonces, and re-authentication mid-dialog
      against more than one server.
- [ ] **Do not disturb**, and time-based call rules.
- [ ] **Multiple simultaneous account registration.** The store holds many
      accounts but `SipClient` runs one UA at a time.
- [ ] **SIP MESSAGE chat.** The `message:received` event is already emitted
      and currently goes nowhere.
- [ ] **Provisioning.** Fetch account config from a URL or QR code, so users
      are not typing WebSocket URIs by hand.

## Architecture and quality

- [ ] **Native SIP transport.** A PJSIP-backed implementation behind the
      existing `SipClient` interface, to reach UDP/TCP-only servers. This is
      the biggest single limitation of the current stack — see the transport
      section in the README.
- [ ] **Tests for `SipClient`.** Mock the JsSIP `UA` and cover the session
      state machine, particularly `reasonFor()` and the `finish()` guard
      against double-termination.
- [ ] **Tests for `CallController`.** The CallKeep/audio interaction is the
      most fragile part of the app and has no coverage.
- [ ] **Error surfacing.** `SipClient` emits an `error` event that nothing
      listens to. Wire it to a toast or a diagnostics screen.
- [ ] **Structured SIP logging.** The `verboseSipLogging` setting exists but
      is not honoured; hook it to JsSIP's `debug` module and add a log viewer.
- [ ] **CI.** GitHub Actions running `npm run check`, plus Android and iOS
      release builds.
- [ ] **Accessibility pass.** Labels exist on the main controls; needs a real
      screen-reader run and a check of the dialpad hit targets.

## Design

- [ ] **Light theme.** Deliberately dropped: the app is dark-only, as
      `macha-client-rn` is. Revisit if it is actually wanted.
- [ ] **Landscape and tablet layouts.**
- [ ] **App icons and splash screen from the owl mark.** Still the React
      Native defaults on both platforms. Needs Android mipmaps plus an
      adaptive icon (foreground/background layers), and an iOS AppIcon set.
- [ ] **Check the top-bar mark at 1x.** The owl's feather strokes start to
      merge below about 24pt; a simplified silhouette variant may be needed
      for small sizes and for the notification icon.
- [ ] **Audio-route picker.** `AudioService.listRoutes` and `selectRoute`
      exist, but the call screen only toggles the speaker. Needs a sheet when
      more than two routes are available.

## Known rough edges

- `StreamTransport` reads a missing Content-Length as an empty body. RFC 3261
  requires the header on a stream transport, so a peer omitting it is broken,
  but being lenient beats desynchronising the stream.
- TLS certificate verification uses the system trust store unless an account
  supplies a CA PEM. There is no way to skip verification, which is correct
  but means a lab server with a self-signed certificate needs its CA pasted
  into the account.

- `AudioService.listRoutes()` offers Bluetooth unconditionally on Android,
  because `react-native-incall-manager` cannot enumerate devices. Selecting it
  is a no-op when nothing is paired.
- `startVideoMuted` and `autoSpeakerOnVideo` are stored and shown in Settings
  but not yet read by `CallController`.
- `vibrateOnRing` is stored but not honoured; the local ringtone path always
  vibrates.
- `SipClient.upgradeToVideo` adds a track and renegotiates, but the downgrade
  path — removing video from a call — is not implemented.
- Contacts are add-and-delete only; there is no edit screen, and only the
  first number on a contact is dialable.
