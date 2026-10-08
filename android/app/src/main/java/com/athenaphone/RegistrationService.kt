//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

package com.athenaphone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Holds the process at foreground priority while an account is online.
 *
 * Without it Android treats the app as backgrounded once its activity is
 * gone: the JS thread is throttled, and the process is eventually killed,
 * taking the SIP connection and the registration with it. Calls then only
 * arrive while the app is on screen. The service does no work of its own;
 * its notification is the price of keeping the process alive, and doubles
 * as a status line saying which account is registered.
 */
class RegistrationService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: getString(R.string.app_name)
    val text = intent?.getStringExtra(EXTRA_TEXT).orEmpty()
    val notification = build(title, text)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    // Not sticky: restarted without the React host it would hold a
    // notification for a registration nothing is running.
    return START_NOT_STICKY
  }

  private fun build(title: String, text: String): Notification {
    ensureChannel(this)
    val open = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    return Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_athenaphone)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "com.athenaphone.registration"
    private const val NOTIFICATION_ID = 0x5150
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"

    /** Start the service, or update its notification if already running. */
    fun show(context: Context, title: String, text: String) {
      val intent = Intent(context, RegistrationService::class.java)
        .putExtra(EXTRA_TITLE, title)
        .putExtra(EXTRA_TEXT, text)
      context.startForegroundService(intent)
    }

    fun hide(context: Context) {
      context.stopService(Intent(context, RegistrationService::class.java))
    }

    private fun ensureChannel(context: Context) {
      val manager = context.getSystemService(NotificationManager::class.java)
      if (manager.getNotificationChannel(CHANNEL_ID) != null) {
        return
      }
      // Low importance: always shown, never makes a sound or peeks.
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Registration",
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.description = "Shown while AthenaPhone is online and can receive calls"
      channel.setShowBadge(false)
      manager.createNotificationChannel(channel)
    }
  }
}
