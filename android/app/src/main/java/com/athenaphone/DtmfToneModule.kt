//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

package com.athenaphone

import android.media.AudioManager
import android.media.ToneGenerator
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.uimanager.ViewManager

/**
 * Local DTMF feedback: the tone a phone plays to its own user when a key is
 * pressed. RFC 4733 events and SIP INFO make no sound at this end, so without
 * this the keypad is silent during a call.
 *
 * During a call the tone goes out on the voice-call stream, so it follows the
 * call's route (earpiece, speaker or headset); before one, on the DTMF stream.
 */
class DtmfToneModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private var callTones: ToneGenerator? = null
  private var dialTones: ToneGenerator? = null

  override fun getName() = "DtmfTone"

  @ReactMethod
  fun play(digit: String, inCall: Boolean) {
    val tone = TONES[digit.uppercase()] ?: return
    val generator = try {
      if (inCall) {
        callTones ?: ToneGenerator(AudioManager.STREAM_VOICE_CALL, VOLUME).also { callTones = it }
      } else {
        dialTones ?: ToneGenerator(AudioManager.STREAM_DTMF, VOLUME).also { dialTones = it }
      }
    } catch (e: RuntimeException) {
      // ToneGenerator throws when the audio system cannot give it a track;
      // a missing click is not worth failing a key press over.
      return
    }
    generator.startTone(tone, DURATION_MS)
  }

  /** Free the generators, for when the app no longer needs them. */
  @ReactMethod
  fun release() {
    callTones?.release()
    dialTones?.release()
    callTones = null
    dialTones = null
  }

  override fun invalidate() {
    release()
    super.invalidate()
  }

  companion object {
    private const val VOLUME = 80
    private const val DURATION_MS = 120
    private val TONES = mapOf(
      "0" to ToneGenerator.TONE_DTMF_0,
      "1" to ToneGenerator.TONE_DTMF_1,
      "2" to ToneGenerator.TONE_DTMF_2,
      "3" to ToneGenerator.TONE_DTMF_3,
      "4" to ToneGenerator.TONE_DTMF_4,
      "5" to ToneGenerator.TONE_DTMF_5,
      "6" to ToneGenerator.TONE_DTMF_6,
      "7" to ToneGenerator.TONE_DTMF_7,
      "8" to ToneGenerator.TONE_DTMF_8,
      "9" to ToneGenerator.TONE_DTMF_9,
      "*" to ToneGenerator.TONE_DTMF_S,
      "#" to ToneGenerator.TONE_DTMF_P,
      "A" to ToneGenerator.TONE_DTMF_A,
      "B" to ToneGenerator.TONE_DTMF_B,
      "C" to ToneGenerator.TONE_DTMF_C,
      "D" to ToneGenerator.TONE_DTMF_D,
    )
  }
}

class DtmfTonePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
    listOf(DtmfToneModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
