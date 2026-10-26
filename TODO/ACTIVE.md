# Active

Open work, highest priority first. When something lands, move it to
[`COMPLETED.md`](COMPLETED.md) under the release that shipped it.

Current release **0.5.0**. Work happens on `develop`; `main` tracks releases.

## Where things stand

Works on Android (Blackview A85, Android 12) against servers that offer
WebRTC media: Asterisk with `webrtc = yes` and AthenaSIP. Registration over
UDP, TCP, TLS and WS; inbound and outbound audio calls; inbound video;
hold, mute, DTMF (RFC 4733 and INFO), blind transfer, history, contacts. Fails with commodity SIP
providers, which offer plain RTP, and that is the priority below; a PJSIP
spike has shown the way (2026-10-11). Reached through AthenaSIP as a trunk,
2talk calls already work (2026-10-12): an inbound carrier call rang, was
answered and carried audio both ways, with AthenaSIP's rtpengine converting
between plain RTP and WebRTC after the phone's 488.

Never run: iOS (never built), outbound video, a completed call over UDP, and
staying registered unattended for hours (it did not, on 2026-10-04).

## 1. Work with commodity SIP providers

The goal: register and call through a typical provider (UDP or TLS, plain RTP
or SDES-SRTP, G.711, NAT) as well as Linphone does, but standards-based.
Decided 2026-10-08: replace JsSIP and react-native-webrtc with PJSIP
(pjsua2, GPLv2 or later) as a native module. Liblinphone is ruled out.

The spike passed on 2026-10-11: PJSIP's sample app on the A85 registered
with 2talk over UDP behind NAT and held a 31-second plain-RTP G.722 call to
voicemail. Results and the build recipe are in
[`docs/pjsip-spike.md`](../docs/pjsip-spike.md).

- [ ] **Engine swap.** A Kotlin module exposing what `SipClient` exposes
      today (register, call, answer, hang up, hold, mute, DTMF, transfer,
      events), behind `CallController`. Build PJSIP with OpenSSL (TLS,
      DTLS-SRTP) and Opus. UI, stores, CallKeep and the background service
      stay. Turn on STUN or NAT rewriting for media: the spike's offer
      carried the phone's private address.
- [ ] **Prove audio both ways with a provider**: a call from a mobile to the
      2talk number, heard at both ends. The spike only showed RTP arriving.
- [ ] **SIP over WebSocket for PJSIP.** PJSIP has none; write an RFC 7118
      transport before removing JsSIP, so WS and WSS accounts keep working.
- [ ] **WebRTC servers keep working** via PJSIP's ICE and DTLS-SRTP.
- [ ] **Rebuild on PJSIP:** video and its native view, the SIP trace and
      media stats, the 488-before-ringing check and end reasons.
- [ ] **Tests on PJSIP.** Build it for macOS so `test:integration` and
      `test:athenasip` drive the shipping engine again; add device runs.

The swap should close these, which are open in the current stack: a Contact
that is WebSocket-shaped on every transport; no `rport`; no keep-alives or
flow recovery (RFC 5626 4.4, 4.5); no DNS SRV or NAPTR (RFC 3263) or
failover; no switch to TCP for large messages; OPTIONS answered with no
capabilities; one registration at a time; codec ordering; digest edge cases.
Check each once the engine is in.

## 2. Keep up with AthenaSIP

What AthenaSIP's `develop` asks of a client, from its session on 2026-10-26.
No released node has it; only `test/interop/up.sh --rtpengine` in that
repository runs it. The current engine already copes with its Digest: two
challenges, SHA-256 then MD5, of which JsSIP keeps only the last and
answers MD5 (so MD5 must stay last there); one answer per nonce, a
`stale=true` re-challenge answered once, 423 Min-Expires retried, one
Call-ID with a rising CSeq across refreshes. Its connection limits (a
message within 30 s of connecting, idle unregistered connections closed,
64 KB messages) are met too.

- [x] **Stop guessing** (2026-10-26). A wrong stored password was re-sent
      on every reconnect, and ten wrong answers ban the phone's address for
      15 minutes. A 401 or 407 after credentials now halts registration
      until the account is edited; a 403 waits out its Retry-After.
- [x] **ICE servers from the subscriber's configuration** (2026-10-27).
      An account's optional server configuration URL; before each call the
      phone fetches `GET /api/v1/subscriber/{realm}/config` with MD5 HTTP
      Digest (`qop=auth`; React Native has no SHA-256) and uses its ICE
      servers, with live TURN credentials, falling back to the account's own
      list after 4 s or any failure. Proven against the develop fixture
      from Node (`test/athenasip/config.test.ts`); not yet on the A85.
- [ ] **The configuration URL needs HTTPS the phone trusts.** A release
      build forbids plain HTTP, and `fetch` trusts only the system store,
      so a node with AthenaSIP's snakeoil certificate cannot be asked.
      That is right for release: a real node has a publicly trusted
      certificate (AthenaSIP's `docs/certificates.md`, Let's Encrypt), and
      AthenaSIP plans nothing server-side (2026-10-27). For the fixture:
      a debug-only network security config (`<debug-overrides>` trusting
      user CAs, or snakeca.crt bundled into debug builds). It only helps a
      debug build on the phone; decide.
- [ ] **The rest of the configuration**: where to signal (`websocket_uris`,
      `transports`, `nodes`), the realm's registration lifetime and
      minimum, conference prefixes and push services.
- [ ] **Failover**: register through the next node when one stops, and two
      flows with reg-id 1 and 2 on a cluster. JsSIP always sends reg-id=1
      (the console shims the second), so probably with PJSIP.
- [ ] **Conferences (RFC 4579)**: a room is `sip:<prefix><name>@realm`,
      dialled as an ordinary call; a join screen from the config's prefixes.
      Only under its Lua policy; the builtin one routes no rooms.
- [ ] **MESSAGE** (RFC 3428) sent and received; 480 shown as not delivered.
- [ ] **Presence, BLF and PUBLISH**: under Features, after the engine swap.
- [x] `npm run test:athenasip` against its develop fixture (84d8c1f,
      2026-10-27): 101 of 103 at first. A resume pressed while the hold
      was still being answered was dropped by JsSIP; fixed, the wanted hold
      state is kept and applied when the dialog is ready.
- [x] **INFO DTMF got 500 from AthenaSIP's develop**, which passed on
      0.12.0: rtpengine could not inject before RTP flowed. AthenaSIP now
      forwards an INFO it cannot play end to end (f001aab). The suite
      against f001aab (2026-10-27): 121 passed, none failed; the restart
      test skips without `ATHENA_SUITE_RESTART_CMD`, and one is a todo.

## 3. Stay registered

- [ ] **Vendor app killers.** Blackview's `BvApplockService` killed the app
      through its foreground service; the restarted process never
      re-registered. Prompt for battery-optimisation exemption, point users
      at vendor whitelists, re-register after a reboot, and find out why the
      restart did not register.
- [ ] **Network changes**: re-register on Wi-Fi to cellular.

## 4. Defects

Those marked (current engine) belong to JsSIP or react-native-webrtc and
should be rechecked, not fixed, once PJSIP is in.

- [ ] **The whole app works over the lock screen** (`showWhenLocked` on
      `MainActivity`). Only the call screen should.
- [ ] **The call screen is invisible to `uiautomator`**, and so probably to
      TalkBack.
- [ ] **The mic is near-silent on outbound calls**: audio starts before
      Telecom settles, and focus is lost 130 ms later. Start audio on
      Telecom's audio-state callback. Seen on 2talk calls. (current engine)
- [ ] **In-band DTMF** is offered in the account form but sends nothing
      in-band yet; it waits for PJSIP.
- [ ] **Every account defaults to Google's STUN server**, which discloses the
      phone's public addresses. Drop the default, or say so in the account
      form. Decide again for PJSIP, which needs STUN or NAT rewriting.
- [ ] The Bluetooth permission prompt interrupts the first call; ask at setup.
- [ ] Adding an account does not make it active.
- [ ] A long registration error crowds out the account name.
- [ ] `startVideoMuted`, `autoSpeakerOnVideo` and `vibrateOnRing` are shown
      in Settings but never used.
- [ ] No way to drop video from a call once added.
- [ ] Only a contact's first number is dialable.
- [ ] Bluetooth is offered as an audio route even when nothing is paired.

## 5. Unverified

- [ ] The video-call toolbar has never been seen in a call.
- [ ] A call completed over UDP.
- [ ] The runtime permission prompts on a clean install.
- [ ] One ringing call was not auto-answered on 2026-10-03; probably a stale
      hot-reloaded copy, since fixed.

## 6. Features

- **Presence, busy-lamp field, SIP MESSAGE, message waiting**, all on PJSIP,
  after the engine swap. Agreed with the AthenaSIP session 2026-10-11 (its
  develop 3bb6770, not yet deployed):
  - Presence (RFC 3856): subscribe per contact with pjsua2 `Buddy`, no
    resource lists (no RFC 4662 or XCAP on AthenaSIP). Publish our own
    status with PUBLISH (RFC 3903, `application/pidf+xml`, RPID kept). With
    nothing published, AthenaSIP shows open while registered.
  - Busy-lamp field (RFC 4235): `Buddy.subscribeDlgEvent`. AthenaSIP builds
    dialog state from its own call records, so the phone publishes nothing.
    Each dialog carries what call pickup with Replaces (RFC 3891) needs.
  - Message waiting (RFC 3842): AthenaSIP has no source and proxies
    `message-summary` to devices; test against a provider or Asterisk.
  - MESSAGE (RFC 3428): proxied, no store-and-forward; 480 when the other
    side has no registration, which the UI must show as not delivered.
  - Watchers must be in the same realm. Accept 200 or 202 to SUBSCRIBE
    (AthenaSIP sends 200), honour 423 Min-Expires, and expect NOTIFYs at
    most every 5 s.
  - Test against AthenaSIP's presence scenarios once deployed (ask Tom), and
    against at least one other server, so nothing is AthenaSIP-specific.
- Push (RFC 8599), attended transfer UI, call waiting, conferencing, an
  audio-route picker, device contacts, provisioning by URL or QR code, call
  recording, do not disturb.
- An in-app log viewer with a share sheet, and surfacing `SipClient` errors.

## 7. Release and platform

- [ ] A distributable release: a real signing key kept out of the repo, and
      the Android version wired to `package.json` (it reports 1.0).
- [ ] CI for check and the Asterisk suite.
- [ ] iOS: build it (needs Xcode and CocoaPods) and verify CallKit.
- [ ] Accessibility pass; a simplified mark for the notification icon;
      landscape and tablet layouts.

## Decisions, not omissions

- Dark only. The accent marks position, never approval; green, amber and red
  mean state only.
- Answer green, hang up red, in fixed positions; in a video call the controls
  become one draggable bar (Tom, 2026-10-04).
- No `Alert`; all dialogs are the app's own.
- A missing `Content-Length` on a stream is read as an empty body.

## Working notes

- Build and install: see the README. Over wireless adb the install takes
  minutes.
- Two A85s: `A85EEA0000005410` (Tom's) and `A85EEA0000005398` (no account).
  Wireless debugging turns itself off; find the port with
  `adb mdns services`.
- A debug build needs `adb reverse tcp:8081 tcp:8081` on every adb session,
  or it closes three seconds after launch.
- UDP does not survive Docker Desktop's NAT on macOS; test with TCP or TLS.
- Tom's A85 also has PJSIP's sample app (`org.pjsip.pjsua2.app`) with the
  2talk account in it, from the spike. Uninstall it once AthenaPhone runs on
  PJSIP. The spike's build tree was temporary; rebuild from the recipe in
  `docs/pjsip-spike.md`.
