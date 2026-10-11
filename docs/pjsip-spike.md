# PJSIP spike, 2026-10-11

Question: can PJSIP give AthenaPhone what the current engine (JsSIP and
react-native-webrtc) cannot, a working call through a typical commodity SIP
provider? Answer: yes.

## What was run

PJSIP 2.17 built for arm64 Android, with its pjsua2 Java bindings, and
PJSIP's own sample app (`org.pjsip.pjsua2.app`) installed on Tom's A85. No
AthenaPhone code was involved. The provider was 2talk (`sip.2talk.co.nz`),
account `02825591432`, over the A85's Wi-Fi behind NAT.

## Results

| | |
| --- | --- |
| Registration | UDP, digest auth, 200 OK. `rport` on the Via; PJSIP learned its public address from the 401 and re-registered with a Contact on it. 2talk then sent OPTIONS keep-alives, which PJSIP answered. |
| Outbound call | To voicemail (`*55`): 401, re-INVITE with credentials, 200, ACK. The INVITE was too large for UDP, so PJSIP sent it over TCP by itself (RFC 3261 18.1.1). |
| Media | 2talk answered with plain RTP. PJSIP dropped ICE ("Remote answer doesn't support ICE") and ran G.722 sendrecv. Remote RTP was received and decoded for the whole 31-second call. |
| Hang-up | BYE, 200 OK. |
| Call to +34610773129 | 2talk sent 183 with early media, then 603 Declined from its own PBX after 3 s. Probably an account restriction on international calls; not a phone fault, not confirmed. |

Not proved: that 2talk received our RTP. The sample app prints no packet
counts; a call from a mobile to the 2talk number would show both directions
by ear.

Found: the SDP offer carried the phone's private address
(`c=IN IP4 10.35.1.164`). 2talk's media server sends back to wherever our
RTP comes from, so it worked; a provider without that would get one-way
audio. The real build needs STUN or NAT rewriting for media.

## Licence and features

PJSIP is GPLv2 or later, compatible with AthenaPhone's GPLv3. Its pjsua2 API
covers presence (`Buddy`, PUBLISH), busy-lamp field
(`Buddy.subscribeDlgEvent`, RFC 4235), message waiting and SIP MESSAGE. It
has no SIP over WebSocket transport; AthenaPhone will need to write one
(RFC 7118).

## Build recipe

Needs the Android NDK the app uses (27.1.12297006), SWIG (`brew install
swig`) and JDK 17. TLS and Opus need OpenSSL and libopus built for Android
first; this spike had neither.

```bash
git clone --depth 1 --branch 2.17 https://github.com/pjsip/pjproject.git
cd pjproject
printf '#define PJ_CONFIG_ANDROID 1\n#include <pj/config_site_sample.h>\n' \
  > pjlib/include/pj/config_site.h
export ANDROID_NDK_ROOT=$HOME/Library/Android/sdk/ndk/27.1.12297006
TARGET_ABI=arm64-v8a APP_PLATFORM=android-24 ./configure-android --use-ndk-cflags
make dep && make clean && make -j8
cd pjsip-apps/src/swig && make          # Java bindings and libpjsua2.so
cd java/android && chmod +x gradlew
echo "sdk.dir=$HOME/Library/Android/sdk" > local.properties
./gradlew :app:assembleDebug            # sample app, about 15 min the first time
```

The sample app needs full SIP URIs in its account screen (`sip:user@host`),
and calls a saved contact rather than a dialled number.
