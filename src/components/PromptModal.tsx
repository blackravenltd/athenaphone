//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useEffect, useRef, useState } from 'react';
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

export interface PromptField {
  /** Shown above the input; leave out for a lone field the title explains. */
  label?: string;
  placeholder?: string;
  initialValue?: string;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
}

interface FormModalProps {
  visible: boolean;
  title: string;
  message?: string;
  fields: PromptField[];
  confirmLabel?: string;
  /** Called with each field's trimmed value, in order, once all are filled. */
  onConfirm: (values: string[]) => void;
  onCancel: () => void;
}

/**
 * A modal form of one or more text fields that works on both platforms.
 *
 * `Alert.prompt` is iOS-only and takes one value, so anything needing input
 * from the user -- blind transfer, adding a contact -- goes through this.
 * Confirm stays disabled until every field has something in it.
 */
export function FormModal({
  visible,
  title,
  message,
  fields,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: FormModalProps) {
  const initial = fields.map(field => field.initialValue ?? '');
  const [values, setValues] = useState(initial);
  const inputs = useRef<(React.ComponentRef<typeof TextInput> | null)[]>([]);

  // Reset between openings so a previous entry does not linger.
  const initialKey = initial.join('\u0000');
  useEffect(() => {
    if (visible) {
      setValues(initialKey.split('\u0000'));
    }
  }, [visible, initialKey]);

  const trimmed = values.map(value => value.trim());
  const complete = trimmed.length === fields.length && trimmed.every(Boolean);

  const submit = () => {
    if (complete) {
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

          {fields.map((field, index) => {
            const last = index === fields.length - 1;
            return (
              <View key={index} style={styles.field}>
                {field.label ? (
                  <Text style={styles.label}>{field.label}</Text>
                ) : null}
                <TextInput
                  ref={input => {
                    inputs.current[index] = input;
                  }}
                  value={values[index] ?? ''}
                  onChangeText={text =>
                    setValues(current =>
                      current.map((value, i) => (i === index ? text : value)),
                    )
                  }
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.textFaint}
                  keyboardType={field.keyboardType ?? 'default'}
                  autoFocus={index === 0}
                  autoCapitalize={field.autoCapitalize ?? 'none'}
                  autoCorrect={false}
                  returnKeyType={last ? 'done' : 'next'}
                  blurOnSubmit={last}
                  style={styles.input}
                  onSubmitEditing={() =>
                    last ? submit() : inputs.current[index + 1]?.focus()
                  }
                  accessibilityLabel={field.label ?? field.placeholder}
                />
              </View>
            );
          })}

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.action}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!complete}
              style={[
                styles.action,
                styles.confirm,
                !complete && styles.disabled,
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

/** A [FormModal] with a single field, for the common one-value prompt. */
export function PromptModal({
  placeholder,
  initialValue,
  keyboardType,
  onConfirm,
  ...rest
}: PromptModalProps) {
  return (
    <FormModal
      {...rest}
      fields={[{ placeholder, initialValue, keyboardType }]}
      onConfirm={([value]) => onConfirm(value)}
    />
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
  field: { gap: space.xs, marginTop: space.sm },
  label: { ...typography.label, color: colors.textDim },
  input: {
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
  confirm: { backgroundColor: colors.accentText },
  cancel: { ...typography.label, color: colors.textDim },
  confirmText: { ...typography.label, color: colors.background },
  disabled: { opacity: 0.35 },
});
