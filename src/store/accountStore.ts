import { create } from 'zustand';

import { CredentialStore } from '../services/CredentialStore';
import { Storage, StorageKeys } from '../services/Storage';
import type { RegistrationStatus, SipAccount } from '../types';
import { uuidv4 } from '../utils/id';

/** Everything a new account needs beyond what the user types. */
export const accountDefaults = {
  // UDP by default: it is the one transport every SIP server speaks, so a
  // new account is most likely to register without being told anything else.
  // TLS is one tap away in the account form and is the better choice wherever
  // the server supports it.
  transport: 'udp' as const,
  registerExpires: 600,
  autoRegister: true,
  enabled: true,
  dtmfMode: 'rfc2833' as const,
  videoEnabled: true,
  keepAliveInterval: 30,
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export type AccountDraft = Omit<SipAccount, 'id' | 'createdAt'> & {
  password: string;
};

interface AccountState {
  accounts: SipAccount[];
  activeAccountId?: string;
  registration: RegistrationStatus;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addAccount: (draft: AccountDraft) => Promise<SipAccount>;
  updateAccount: (
    id: string,
    changes: Partial<AccountDraft>,
  ) => Promise<SipAccount | undefined>;
  removeAccount: (id: string) => Promise<void>;
  setActiveAccount: (id: string | undefined) => Promise<void>;
  setRegistration: (status: RegistrationStatus) => void;
  activeAccount: () => SipAccount | undefined;
}

async function persist(accounts: SipAccount[], activeAccountId?: string) {
  await Storage.write(StorageKeys.accounts, accounts);
  await Storage.write(StorageKeys.activeAccountId, activeAccountId ?? null);
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: undefined,
  registration: { state: 'unregistered' },
  hydrated: false,

  async hydrate() {
    const accounts = await Storage.read<SipAccount[]>(StorageKeys.accounts, []);
    const stored = await Storage.read<string | null>(
      StorageKeys.activeAccountId,
      null,
    );
    // A stale active id (account deleted on another install) must not leave
    // the app pointing at nothing selectable.
    const activeAccountId =
      accounts.find(account => account.id === stored)?.id ?? accounts[0]?.id;

    set({ accounts, activeAccountId, hydrated: true });
  },

  async addAccount(draft) {
    const { password, ...rest } = draft;
    const account: SipAccount = {
      ...rest,
      id: uuidv4(),
      createdAt: Date.now(),
    };

    await CredentialStore.save(account.id, account.username, password);
    const accounts = [...get().accounts, account];
    const activeAccountId = get().activeAccountId ?? account.id;

    set({ accounts, activeAccountId });
    await persist(accounts, activeAccountId);
    return account;
  },

  async updateAccount(id, changes) {
    const { password, ...rest } = changes;
    const accounts = get().accounts.map(account =>
      account.id === id ? { ...account, ...rest } : account,
    );
    const updated = accounts.find(account => account.id === id);
    if (!updated) {
      return undefined;
    }
    if (password) {
      await CredentialStore.save(id, updated.username, password);
    }
    set({ accounts });
    await persist(accounts, get().activeAccountId);
    return updated;
  },

  async removeAccount(id) {
    const accounts = get().accounts.filter(account => account.id !== id);
    const activeAccountId =
      get().activeAccountId === id ? accounts[0]?.id : get().activeAccountId;

    await CredentialStore.remove(id);
    set({ accounts, activeAccountId });
    await persist(accounts, activeAccountId);
  },

  async setActiveAccount(id) {
    set({ activeAccountId: id });
    await persist(get().accounts, id);
  },

  setRegistration(status) {
    set({ registration: status });
  },

  activeAccount() {
    const { accounts, activeAccountId } = get();
    return accounts.find(account => account.id === activeAccountId);
  },
}));
