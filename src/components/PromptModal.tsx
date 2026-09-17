import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  colors,
  radius,
  space,
  type as typography,
  TOUCH_TARGET,
} from '../theme';

interface PromptModalProps {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  keyboardType?: 'default' | 'phone-pad';
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * A text prompt that works on both platforms.
 *
 * `Alert.prompt` is iOS-only, so anything needing a value from the user --
 * blind transfer, adding a contact -- goes through this instead.
 */
export function PromptModal({
  visible,
  title,
  message,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  keyboardType = 'default',
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const [value, setValue] = useState(initialValue);

  // Reset between openings so a previous entry does not linger.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
    }
  }, [visible, initialValue]);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />

        <View style={styles.sheet}>
          <Text style={typography.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            keyboardType={keyboardType}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={submit}
          />

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.action}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!value.trim()}
              style={[
                styles.action,
                styles.confirm,
                !value.trim() && styles.disabled,
              ]}
            >
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    padding: space.xl,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  message: { ...typography.caption, color: colors.textDim },
  input: {
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
    fontSize: 16,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.sm,
  },
  action: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
  },
  confirm: { backgroundColor: colors.accent },
  cancel: { ...typography.label, color: colors.textDim },
  confirmText: { ...typography.label, color: colors.background },
  disabled: { opacity: 0.35 },
});
