import * as Keychain from 'react-native-keychain';

/**
 * SIP passwords live in the iOS keychain / Android keystore, never in
 * AsyncStorage and never in the serialized `SipAccount`.
 *
 * One keychain entry per account, keyed by account id.
 */
const serviceFor = (accountId: string) =>
  `com.athenaphone.account.${accountId}`;

export const CredentialStore = {
  async save(
    accountId: string,
    username: string,
    password: string,
  ): Promise<void> {
    await Keychain.setGenericPassword(username, password, {
      service: serviceFor(accountId),
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async load(accountId: string): Promise<string | undefined> {
    const entry = await Keychain.getGenericPassword({
      service: serviceFor(accountId),
    });
    return entry ? entry.password : undefined;
  },

  async remove(accountId: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: serviceFor(accountId) });
  },
};
