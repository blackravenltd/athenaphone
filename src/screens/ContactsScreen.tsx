//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React, { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlusIcon } from '../components/Icons';
import { FormModal } from '../components/PromptModal';
import { Row } from '../components/Row';
import { Screen } from '../components/Screen';
import { useCriticalAction } from '../hooks/useCriticalAction';
import { CallController } from '../services/CallController';
import { Dialog } from '../store/dialogStore';
import { useContactsStore } from '../store/contactsStore';
import {
  colors,
  radius,
  space,
  type as typography,
  TOUCH_TARGET,
} from '../theme';
import type { Contact } from '../types';

export function ContactsScreen() {
  const contacts = useContactsStore(state => state.contacts);
  const addContact = useContactsStore(state => state.addContact);
  const removeContact = useContactsStore(state => state.removeContact);
  const toggleFavorite = useContactsStore(state => state.toggleFavorite);
  const updateContact = useContactsStore(state => state.updateContact);

  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | undefined>(undefined);

  const sections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? contacts.filter(
          contact =>
            contact.displayName.toLowerCase().includes(needle) ||
            contact.numbers.some(number =>
              number.value.toLowerCase().includes(needle),
            ),
        )
      : contacts;

    const favorites = matches.filter(contact => contact.favorite);
    const others = matches.filter(contact => !contact.favorite);

    return [
      ...(favorites.length ? [{ title: 'Favourites', data: favorites }] : []),
      ...(others.length ? [{ title: 'All contacts', data: others }] : []),
    ];
  }, [contacts, query]);

  const { run: call } = useCriticalAction(async (contact: Contact) => {
    const target = contact.numbers[0]?.value;
    if (!target) {
      return;
    }
    try {
      await CallController.placeCall(target);
    } catch (error) {
      void Dialog.alert(
        'Could not place call',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  });

  const contactActions = useCallback(
    (contact: Contact) => {
      void Dialog.actions({
        title: contact.displayName,
        actions: [
          { label: 'Edit contact', onPress: () => setEditing(contact) },
          {
            label: contact.favorite ? 'Remove favourite' : 'Add favourite',
            onPress: () => void toggleFavorite(contact.id),
          },
          {
            label: 'Delete contact',
            tone: 'danger',
            onPress: () => void removeContact(contact.id),
          },
        ],
      });
    },
    [removeContact, toggleFavorite],
  );

  /** Name and the first number; any further numbers are left as they are. */
  const handleEdit = useCallback(
    ([name, number]: string[]) => {
      const contact = editing;
      setEditing(undefined);
      if (!contact) {
        return;
      }
      const [first, ...rest] = contact.numbers;
      void updateContact(contact.id, {
        displayName: name,
        numbers: [{ label: first?.label ?? 'SIP', value: number }, ...rest],
      });
    },
    [editing, updateContact],
  );

  const handleAdd = useCallback(
    ([name, number]: string[]) => {
      setAdding(false);
      void addContact({
        displayName: name,
        numbers: [{ label: 'SIP', value: number }],
      });
    },
    [addContact],
  );

  return (
    <Screen
      title="Contacts"
      headerRight={
        <Pressable
          onPress={() => setAdding(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add contact"
        >
          <PlusIcon size={22} color={colors.text} />
        </Pressable>
      }
      below={
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      }
    >
      <SectionList
        sections={sections}
        keyExtractor={contact => contact.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={typography.heading}>
              {query ? 'No matches' : 'No contacts yet'}
            </Text>
            <Text style={styles.emptyDetail}>
              {query
                ? 'Try a different name or number.'
                : 'Add the extensions you call often.'}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <Row
            title={item.displayName}
            detail={item.numbers.map(number => number.value).join('  ')}
            tone={item.favorite ? 'ok' : 'unknown'}
            showDot={item.favorite}
            onPress={() => call(item)}
            onLongPress={() => contactActions(item)}
          />
        )}
      />

      <FormModal
        visible={editing !== undefined}
        title="Edit contact"
        fields={[
          {
            label: 'Name',
            initialValue: editing?.displayName,
            autoCapitalize: 'words',
          },
          {
            label: 'Number or SIP address',
            initialValue: editing?.numbers[0]?.value,
          },
        ]}
        confirmLabel="Save"
        onConfirm={handleEdit}
        onCancel={() => setEditing(undefined)}
      />

      <FormModal
        visible={adding}
        title="New contact"
        fields={[
          { label: 'Name', placeholder: 'Alice', autoCapitalize: 'words' },
          { label: 'Number or SIP address', placeholder: '1001' },
        ]}
        confirmLabel="Add"
        onConfirm={handleAdd}
        onCancel={() => setAdding(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.lg,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
  },
  list: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingBottom: space.xxl,
  },
  sectionHeader: {
    ...typography.heading,
    paddingTop: space.lg,
    paddingBottom: space.xs,
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxl * 2,
  },
  emptyDetail: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: 'center',
  },
});
