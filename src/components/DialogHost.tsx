import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDialogStore, type DialogAction } from '../store/dialogStore';
import { colors, radius, space, type as typography, TOUCH_TARGET } from '../theme';

/**
 * Draws whatever `Dialog` has queued.
 *
 * Mounted once, above the navigator, so a dialog raised from anywhere -- a
 * screen, a service, a failed call -- appears over the current view without
 * that code needing a reference to any UI.
 */
export function DialogHost() {
  const request = useDialogStore(state => state.queue[0]);
  const dismiss = useDialogStore(state => state.dismiss);

  if (!request) {
    return null;
  }

  const choose = (action: DialogAction) => {
    // Run the action's own handler before resolving, so a caller awaiting the
    // promise sees the effect already applied.
    action.onPress?.();
    dismiss(request.id, action.label);
  };

  const colorFor = (tone: DialogAction['tone']) =>
    tone === 'danger'
      ? colors.danger
      : tone === 'cancel'
        ? colors.textDim
        : colors.accent;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => dismiss(request.id)}>
      <View style={styles.backdrop}>
        {/* Tapping outside is the same as cancelling. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss(request.id)} />

        <View style={styles.sheet}>
          <Text style={typography.title}>{request.title}</Text>
          {request.message ? (
            <Text style={styles.message}>{request.message}</Text>
          ) : null}

          <View style={styles.actions}>
            {request.actions.map(action => (
              <Pressable
                key={action.label}
                onPress={() => choose(action)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
                <Text style={[styles.actionLabel, { color: colorFor(action.tone) }]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    backgroundColor: colors.scrim,
  },
  sheet: {
    gap: space.sm,
    paddingTop: space.xl,
    paddingHorizontal: space.xl,
    paddingBottom: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  message: { ...typography.body, color: colors.textDim },
  actions: { marginTop: space.sm },
  action: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  actionLabel: { ...typography.body, fontWeight: '500', textAlign: 'center' },
});
