import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  NavigationContainer,
  useNavigation,
  type Theme,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { DialogHost } from '../components/DialogHost';
import { CallScreen } from '../screens/CallScreen';
import { ContactsScreen } from '../screens/ContactsScreen';
import { DialerScreen } from '../screens/DialerScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { AccountScreen } from '../screens/AccountScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { selectHasActiveCall, useCallStore } from '../store/callStore';
import { colors } from '../theme';
import { BottomNav } from './BottomNav';

export type RootStackParamList = {
  Main: undefined;
  Account: { accountId?: string } | undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Navigation's own palette, so screen transitions do not flash white. */
const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.ok,
    notification: colors.danger,
  },
};

/**
 * Hoisted to module scope and reaching for navigation itself, so the tab keeps
 * one component type across renders rather than remounting the screen.
 */
function SettingsRoute() {
  const navigation =
    useNavigation<
      NativeStackScreenProps<RootStackParamList, 'Main'>['navigation']
    >();

  const editAccount = useCallback(
    (accountId?: string) => navigation.navigate('Account', { accountId }),
    [navigation],
  );

  return <SettingsScreen onEditAccount={editAccount} />;
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={props => <BottomNav {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen
        name="Dialer"
        component={DialerScreen}
        options={{ title: 'Keypad' }}
      />
      <Tab.Screen
        name="Recents"
        component={HistoryScreen}
        options={{ title: 'Recents' }}
      />
      <Tab.Screen
        name="Contacts"
        component={ContactsScreen}
        options={{ title: 'Contacts' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsRoute}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

/**
 * The call screen is an overlay rather than a route.
 *
 * A call can start at any moment, including from the lock screen, and it must
 * cover whatever the user was doing without disturbing the navigation stack
 * they will return to when it ends.
 */
export function RootNavigator() {
  const hasActiveCall = useCallStore(selectHasActiveCall);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen
          name="Account"
          options={{ presentation: 'modal' }}
          component={AccountRoute}
        />
      </Stack.Navigator>

      {hasActiveCall ? (
        <View style={StyleSheet.absoluteFill}>
          <CallScreen />
        </View>
      ) : null}

      {/* Above the call screen too, so a failure during a call is visible. */}
      <DialogHost />
    </NavigationContainer>
  );
}

function AccountRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Account'>) {
  return (
    <AccountScreen
      accountId={route.params?.accountId}
      onDone={() => navigation.goBack()}
    />
  );
}
