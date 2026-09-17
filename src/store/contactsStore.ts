import { create } from 'zustand';

import { Storage, StorageKeys } from '../services/Storage';
import type { Contact } from '../types';
import { uuidv4 } from '../utils/id';

interface ContactsState {
  contacts: Contact[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addContact: (
    contact: Omit<Contact, 'id' | 'external' | 'favorite'> &
      Partial<Pick<Contact, 'favorite'>>,
  ) => Promise<Contact>;
  updateContact: (id: string, changes: Partial<Contact>) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
}

/** Alphabetical by display name, so the list never needs sorting at render. */
function sorted(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );
}

export const useContactsStore = create<ContactsState>((set, get) => ({
  contacts: [],
  hydrated: false,

  async hydrate() {
    const contacts = await Storage.read<Contact[]>(StorageKeys.contacts, []);
    set({ contacts: sorted(contacts), hydrated: true });
  },

  async addContact(draft) {
    const contact: Contact = {
      favorite: false,
      ...draft,
      id: uuidv4(),
      external: false,
    };
    const contacts = sorted([...get().contacts, contact]);
    set({ contacts });
    await Storage.write(StorageKeys.contacts, contacts);
    return contact;
  },

  async updateContact(id, changes) {
    const contacts = sorted(
      get().contacts.map(contact =>
        contact.id === id ? { ...contact, ...changes } : contact,
      ),
    );
    set({ contacts });
    await Storage.write(StorageKeys.contacts, contacts);
  },

  async removeContact(id) {
    const contacts = get().contacts.filter(contact => contact.id !== id);
    set({ contacts });
    await Storage.write(StorageKeys.contacts, contacts);
  },

  async toggleFavorite(id) {
    const contact = get().contacts.find(entry => entry.id === id);
    if (contact) {
      await get().updateContact(id, { favorite: !contact.favorite });
    }
  },
}));
