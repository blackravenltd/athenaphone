# Completed

What each release shipped, newest first.

## 0.4.1, 2026-10-08

No app change. Recorded two defects found in live testing.

## 0.4.0, 2026-10-08

- A call's outcome stays on screen until dismissed: Busy, No answer,
  Declined, Unavailable, Could not connect, Connection lost, or Call ended
  with its length, with the server's response; Close or Call again.
- Contacts: separate name and number fields, and editing.
- **Remain in background** (default on): a foreground service with a
  notification keeps the app online off screen.
- In a video call the controls are one small, draggable, translucent bar.
- `npm run test:athenasip`: registration on every transport and calls
  between two copies of the SIP stack through a live AthenaSIP node, with
  werift as WebRTC, in direct and TURN-relayed media.
- README rewritten for Android. Every dash is a plain hyphen.

Verified: registration over TLS and TCP from the internet to a public
AthenaSIP node behind NAT, and inbound video through rtpengine.

## 0.3.0, 2026-10-03

- An offer the phone cannot answer (plain RTP) is refused with 488 before it
  rings, instead of ringing and leaving a missed call.
- A JsSIP patch stops it answering a quick re-INVITE with 482.
- A hot reload no longer leaves the old SIP client registered.
- The CA certificate field holds a PEM, so TLS works with a private CA.
- A release build that runs without Metro.
- The SIP trace (Settings, Diagnostics): every message as sent and
  received, plus per-call media state.
- Android rings for inbound calls; outbound calls no longer wait ~40 s for
  ICE gathering.

Verified on the A85: registration over UDP, TCP and TLS; inbound and
outbound calls with two-way audio against AthenaSIP; the first inbound video
call; the 407 challenge on UDP.

## 0.2.1, 2026-09-18

The shared AthenaSIP dark palette, with the rule that the accent marks
position, never approval. Two text colours lifted to pass 4.5:1 contrast.

## 0.2.0, 2026-09-17

The first release to complete a call: two-way Opus over DTLS-SRTP against
Asterisk, with the system call UI, hang-up and history.

- `test/asterisk`, a disposable fixture serving every transport with
  single-purpose test extensions and AMI.
- `test/integration`, the real SIP stack against it from Node.
- Dial, answer, hang up and transfer ignore repeated presses.
- Fixed: a crash on the first outbound call (a runtime permission
  CallKeep needs), one tap placing two calls, and a stop that returned
  before the socket closed.

## 0.1.0, 2026-09-16

The initial build: React Native 0.87, TypeScript, JsSIP and
react-native-webrtc. SIP over UDP, TCP, TLS and WebSocket; audio and video
calls, hold, mute, DTMF, blind and attended transfer; CallKeep for the
system call UI; passwords in the keychain; dialler, call screen, recents,
contacts, settings and account editor; app-drawn dialogs only. A
`patch-package` fix lets `react-native-callkeep` load under RN 0.87.
