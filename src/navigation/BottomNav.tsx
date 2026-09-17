import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ClockIcon,
  ContactsIcon,
  KeypadIcon,
  SettingsIcon,
  type IconProps,
} from '../components/Icons';
import { useHistoryStore } from '../store/historyStore';
import { colors, radius, space, type as typography } from '../theme';

export const BOTTOM_NAV_HEIGHT = 58;

const ICONS: Record<string, React.ComponentType<IconProps>> = {
  Dialer: KeypadIcon,
  Recents: ClockIcon,
  Contacts: ContactsIcon,
  Settings: SettingsIcon,
};

/**
 * The primary navigation, docked at the bottom where a thumb reaches. It sits
 * above the safe-area inset rather than inside it, so the gesture bar never
 * overlaps a target.
 */
export function BottomNav({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const missedCount = useHistoryStore(
    store => store.entries.filter(entry => entry.missed).length,
  );

  return (
    <View
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          height: BOTTOM_NAV_HEIGHT + insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const active = state.index === index;
        const Icon = ICONS[route.name];

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const showBadge = route.name === 'Recents' && missedCount > 0;

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={
              showBadge ? `${label}, ${missedCount} missed` : label
            }
            accessibilityState={{ selected: active }}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <View style={styles.iconWell}>
              {Icon ? (
                <Icon
                  size={21}
                  color={active ? colors.text : colors.textFaint}
                />
              ) : null}
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {missedCount > 9 ? '9+' : missedCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.backgroundLift,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    paddingTop: space.sm,
    gap: 2,
  },
  pressed: { opacity: 0.65 },
  // No active fill: the selected tab is carried by the icon and label
  // brightening, as a platform tab bar does. The well exists only to give the
  // missed-call badge something to anchor to.
  iconWell: {
    paddingHorizontal: space.md,
    paddingVertical: 3,
  },
  label: {
    ...typography.micro,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  labelActive: { color: colors.text },
  badge: {
    position: 'absolute',
    top: -1,
    right: space.sm,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.background,
  },
});
