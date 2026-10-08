# Active

Open work, highest priority first. When something lands, move it to
[`COMPLETED.md`](COMPLETED.md) under the release that shipped it.

Current release **0.4.1**. Work happens on `develop`; `main` tracks releases.

## Where things stand

Works on Android (Blackview A85, Android 12) against servers that offer
WebRTC media: Asterisk with `webrtc = yes` and AthenaSIP. Registration over
UDP, TCP, TLS and WS; inbound and outbound audio calls; inbound video;
hold, mute, DTMF, blind transfer, history, contacts. Fails with commodity SIP
providers, which offer plain RTP, and that is the priority below.

Never run: iOS (never built), outbound video, a completed call over UDP, and
staying registered unattended for hours (it did not, on 2026-10-04).

## 1. Work with commodity SIP providers

The goal: register and call through a typical provider (UDP or TLS, plain RTP
or SDES-SRTP, G.711, NAT) as well as Linphone does, but standards-based.
Decided 2026-10-08: replace JsSIP and react-native-webrtc with PJSIP
(pjsua2) as a native module. Liblinphone is ruled out.

- [ ] **Spike.** PJSIP 2.17 builds for arm64 Android with its Java bindings,
      and its sample app is built (no TLS or Opus yet). Next: on the A85,
      register with 2talk and complete a plain-RTP G.711 call. PJSIP is
      GPLv2-or-later, compatible with our GPLv3, and has busy-lamp field
      (`Buddy.subscribeDlgEvent`). Stop and report to Tom when it works.
- [ ] **Engine swap.** A Kotlin module exposing what `SipClient` exposes
      today (register, call, answer, hang up, hold, mute, DTMF, transfer,
      events), behind `CallController`. Build with OpenSSL and Opus. UI,
      stores, CallKeep and the background service stay.
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

## 2. Stay registered

- [ ] **Vendor app killers.** Blackview's `BvApplockService` killed the app
      through its foreground service; the restarted process never
      re-registered. Prompt for battery-optimisation exemption, point users
      at vendor whitelists, re-register after a reboot, and find out why the
      restart did not register.
- [ ] **Network changes**: re-register on Wi-Fi to cellular.

## 3. Defects

- [ ] **The whole app works over the lock screen** (`showWhenLocked` on
      `MainActivity`). Only the call screen should.
- [ ] **A call that ends before ICE connects leaves its media watcher
      running** until the app is stopped.
- [ ] **The call screen is invisible to `uiautomator`**, and so probably to
      TalkBack.
- [ ] **Audio focus is refused on outbound calls**: audio starts before
      Telecom settles. Latent.
- [ ] **Every account defaults to Google's STUN server**, which discloses the
      phone's public addresses. Drop the default, or say so in the account
      form.
- [ ] The Bluetooth permission prompt interrupts the first call; ask at setup.
- [ ] Adding an account does not make it active.
- [ ] A long registration error crowds out the account name.
- [ ] `startVideoMuted`, `autoSpeakerOnVideo` and `vibrateOnRing` are shown
      in Settings but never used.
- [ ] No way to drop video from a call once added.
- [ ] Only a contact's first number is dialable.
- [ ] Bluetooth is offered as an audio route even when nothing is paired.

## 4. Unverified

- [ ] The video-call toolbar has never been seen in a call.
- [ ] A call completed over UDP.
- [ ] The runtime permission prompts on a clean install.
- [ ] One ringing call was not auto-answered on 2026-10-03; probably a stale
      hot-reloaded copy, since fixed.

## 5. Features

- Presence and busy-lamp field, SIP MESSAGE, message waiting (all on PJSIP).
- Push (RFC 8599), attended transfer UI, call waiting, conferencing, an
  audio-route picker, device contacts, provisioning by URL or QR code, call
  recording, do not disturb.
- An in-app log viewer with a share sheet, and surfacing `SipClient` errors.

## 6. Release and platform

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
