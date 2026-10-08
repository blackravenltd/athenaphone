//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AthenaMark } from './src/components/Logo';
import { RootNavigator } from './src/navigation/RootNavigator';
import { CallController } from './src/services/CallController';
import { PermissionsService } from './src/services/PermissionsService';
import { RegistrationNotice } from './src/services/RegistrationNotice';
import { sipClient } from './src/sip/SipClient';
import { sipTrace } from './src/sip/SipTrace';
import { useAccountStore } from './src/store/accountStore';
import { useContactsStore } from './src/store/contactsStore';
import { useHistoryStore } from './src/store/historyStore';
import { useSettingsStore } from './src/store/settingsStore';
import { colors, type as typography } from './src/theme';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      // Settings first: CallController.init() reads useSystemCallUi.
      await useSettingsStore.getState().hydrate();
      // Before connectActiveAccount() below builds a socket, or the REGISTER
      // that starts everything off happens outside the trace.
      sipTrace.setEnabled(useSettingsStore.getState().verboseSipLogging);
      await Promise.all([
        useAccountStore.getState().hydrate(),
        useHistoryStore.getState().hydrate(),
        useContactsStore.getState().hydrate(),
      ]);

      await CallController.init();
      await PermissionsService.requestNotifications();
      await CallController.connectActiveAccount();

      if (!cancelled) {
        setReady(true);
      }
    }

    bootstrap().catch(error => {
      console.error('[app] bootstrap failed', error);
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the trace following the setting, so turning it on mid-session takes
  // effect on the live socket rather than at the next reconnect.
  useEffect(
    () =>
      useSettingsStore.subscribe(state =>
        sipTrace.setEnabled(state.verboseSipLogging),
      ),
    [],
  );

  // Start or stop the background service as soon as the setting changes,
  // rather than at the next registration event.
  useEffect(
    () =>
      useSettingsStore.subscribe((state, previous) => {
        if (state.remainInBackground !== previous.remainInBackground) {
          RegistrationNotice.sync();
        }
      }),
    [],
  );

  // Coming back from the background can find a registration that quietly
  // expired while the socket was suspended.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        sipClient.refreshRegistration();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {/* RN 0.87 is edge-to-edge on Android; the window background
            comes from styles.xml instead of a StatusBar prop. */}
        <StatusBar barStyle="light-content" />
        {ready ? (
          <RootNavigator />
        ) : (
          <View style={styles.loading}>
            <AthenaMark height={140} opacity={0.9} />
            <ActivityIndicator color={colors.textFaint} />
            <Text style={styles.loadingLabel}>Starting</Text>
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingLabel: { ...typography.caption, color: colors.textFaint },
});
