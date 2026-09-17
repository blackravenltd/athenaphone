import React, { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AthenaMark, Watermark } from '../components/Logo';
import { SectionLabel } from '../components/SectionLabel';
import { SegmentedControl } from '../components/SegmentedControl';
import { Toggle } from '../components/Toggle';
import { CallController } from '../services/CallController';
import { CredentialStore } from '../services/CredentialStore';
import { accountDefaults, useAccountStore } from '../store/accountStore';
import { Dialog } from '../store/dialogStore';
import { defaultPortFor, type SipTransport } from '../types';
import {
  colors,
  radius,
  space,
  type as typography,
  TOUCH_TARGET,
} from '../theme';

interface AccountScreenProps {
  /** Undefined means "new account". */
  accountId?: string;
  onDone: () => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  hint?: string;
  secure?: boolean;
  keyboardType?: 'default' | 'url' | 'number-pad';
  autoCapitalize?: 'none' | 'words';
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  secure,
  keyboardType = 'default',
  autoCapitalize = 'none',
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={typography.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Add or edit a SIP account.
 *
 * The password field starts blank when editing: the stored password is never
 * read back into the form, and leaving it blank keeps the existing one.
 */
export function AccountScreen({ accountId, onDone }: AccountScreenProps) {
  const accounts = useAccountStore(state => state.accounts);
  const addAccount = useAccountStore(state => state.addAccount);
  const updateAccount = useAccountStore(state => state.updateAccount);

  const existing = useMemo(
    () => accounts.find(account => account.id === accountId),
    [accounts, accountId],
  );

  const [name, setName] = useState(existing?.name ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState('');
  const [domain, setDomain] = useState(existing?.domain ?? '');
  const [transport, setTransport] = useState<SipTransport>(
    existing?.transport ?? accountDefaults.transport,
  );
  const [server, setServer] = useState(existing?.server ?? '');
  const [port, setPort] = useState(
    existing?.port ? String(existing.port) : '',
  );
  const [wsUri, setWsUri] = useState(existing?.wsUri ?? '');
  const [tlsCaPem, setTlsCaPem] = useState(existing?.tlsCaPem ?? '');
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '');
  const [authorizationUser, setAuthorizationUser] = useState(
    existing?.authorizationUser ?? '',
  );
  const [outboundProxy, setOutboundProxy] = useState(
    existing?.outboundProxy ?? '',
  );
  const [voicemailNumber, setVoicemailNumber] = useState(
    existing?.voicemailNumber ?? '',
  );
  const [registerExpires, setRegisterExpires] = useState(
    String(existing?.registerExpires ?? accountDefaults.registerExpires),
  );
  const [videoEnabled, setVideoEnabled] = useState(
    existing?.videoEnabled ?? accountDefaults.videoEnabled,
  );
  const [autoRegister, setAutoRegister] = useState(
    existing?.autoRegister ?? accountDefaults.autoRegister,
  );
  const [useInfoDtmf, setUseInfoDtmf] = useState(existing?.dtmfMode === 'info');

  const isWebSocket = transport === 'ws' || transport === 'wss';

  /**
   * Offer a starting WebSocket URI. The port is a guess -- RFC 7118 registers
   * none -- so this uses Asterisk's, which is the most common deployment.
   */
  const suggestWsUri = useCallback(() => {
    if (!wsUri && domain) {
      const scheme = transport === 'ws' ? 'ws' : 'wss';
      setWsUri(`${scheme}://${domain}:8089/ws`);
    }
  }, [domain, wsUri, transport]);

  const save = useCallback(async () => {
    if (!username.trim() || !domain.trim()) {
      void Dialog.alert('Missing details', 'Username and domain are required.');
      return;
    }
    if (isWebSocket && !wsUri.trim()) {
      void Dialog.alert(
        'Missing WebSocket URI',
        'SIP over WebSocket has no standard port, so the full URI is required.',
      );
      return;
    }
    if (!existing && !password) {
      void Dialog.alert(
        'Missing password',
        'A password is required for a new account.',
      );
      return;
    }
    if (isWebSocket && wsUri.trim() && !/^wss?:\/\//.test(wsUri.trim())) {
      void Dialog.alert(
        'Invalid WebSocket URI',
        'A WebSocket URI must start with ws:// or wss://.',
      );
      return;
    }

    const draft = {
      ...accountDefaults,
      name: name.trim() || domain.trim(),
      username: username.trim(),
      password,
      domain: domain.trim(),
      transport,
      server: server.trim() || undefined,
      port: port.trim() ? Number(port) : undefined,
      wsUri: isWebSocket ? wsUri.trim() || undefined : undefined,
      tlsCaPem: transport === 'tls' ? tlsCaPem.trim() || undefined : undefined,
      displayName: displayName.trim() || undefined,
      authorizationUser: authorizationUser.trim() || undefined,
      outboundProxy: outboundProxy.trim() || undefined,
      voicemailNumber: voicemailNumber.trim() || undefined,
      registerExpires:
        Number(registerExpires) || accountDefaults.registerExpires,
      videoEnabled,
      autoRegister,
      dtmfMode: useInfoDtmf ? ('info' as const) : ('rfc2833' as const),
    };

    if (existing) {
      // An empty password box means "leave the stored one alone".
      await updateAccount(
        existing.id,
        password ? draft : { ...draft, password: undefined },
      );
    } else {
      await addAccount(draft);
    }

    await CallController.connectActiveAccount();
    onDone();
  }, [
    existing,
    name,
    username,
    password,
    domain,
    transport,
    server,
    port,
    wsUri,
    tlsCaPem,
    isWebSocket,
    displayName,
    authorizationUser,
    outboundProxy,
    voicemailNumber,
    registerExpires,
    videoEnabled,
    autoRegister,
    useInfoDtmf,
    addAccount,
    updateAccount,
    onDone,
  ]);

  const clearPassword = useCallback(() => {
    if (existing) {
      void CredentialStore.remove(existing.id);
      void Dialog.alert(
        'Password cleared',
        'Enter a new password to register again.',
      );
    }
  }, [existing]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Watermark />

      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
        <View style={styles.headerTitle}>
          <AthenaMark height={20} />
          <Text style={typography.label}>
            {existing ? 'Edit account' : 'New account'}
          </Text>
        </View>
        <Pressable onPress={() => void save()} hitSlop={8}>
          <Text style={styles.save}>Save</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SectionLabel>Identity</SectionLabel>
          <View style={styles.group}>
            <Field
              label="Account name"
              value={name}
              onChangeText={setName}
              placeholder="Work PBX"
              autoCapitalize="words"
            />
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="1001"
              hint="Usually your extension number"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder={existing ? 'Unchanged' : 'SIP password'}
              secure
              hint="Stored in the device keychain, never in app storage"
            />
            <Field
              label="Domain"
              value={domain}
              onChangeText={setDomain}
              placeholder="pbx.example.com"
            />
          </View>

          <SectionLabel>Transport</SectionLabel>
          <View style={styles.group}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Protocol</Text>
              <SegmentedControl
                accessibilityLabel="SIP transport"
                value={transport}
                onChange={setTransport}
                options={[
                  { value: 'udp', label: 'UDP' },
                  { value: 'tcp', label: 'TCP' },
                  { value: 'tls', label: 'TLS' },
                  { value: 'wss', label: 'WSS' },
                ]}
              />
              <Text style={styles.hint}>
                {transport === 'udp'
                  ? 'Works with almost every SIP server. Credentials are sent in the clear.'
                  : transport === 'tcp'
                    ? 'Avoids the datagram size limit on large INVITEs. Still unencrypted.'
                    : transport === 'tls'
                      ? 'Encrypted signalling on port 5061. Preferred wherever the server supports it.'
                      : 'SIP over WebSocket, as PBXs expose for WebRTC. Needs the full URI below.'}
              </Text>
            </View>

            {isWebSocket ? (
              <>
                <Field
                  label="WebSocket URI"
                  value={wsUri}
                  onChangeText={setWsUri}
                  placeholder="wss://pbx.example.com:8089/ws"
                  keyboardType="url"
                  hint="RFC 7118 registers no port, so this must be the full URI your server listens on."
                />
                {!wsUri && domain ? (
                  <Pressable onPress={suggestWsUri} style={styles.suggest}>
                    <Text style={styles.suggestLabel}>
                      Try wss://{domain}:8089/ws
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Field
                  label="Server"
                  value={server}
                  onChangeText={setServer}
                  placeholder={domain || 'sip.example.com'}
                  hint="Leave blank to use the domain above."
                />
                <Field
                  label="Port"
                  value={port}
                  onChangeText={setPort}
                  keyboardType="number-pad"
                  placeholder={String(defaultPortFor(transport) ?? '')}
                  hint={`Defaults to ${defaultPortFor(transport)} for ${transport.toUpperCase()}.`}
                />
              </>
            )}

            {transport === 'tls' ? (
              <Field
                label="CA certificate"
                value={tlsCaPem}
                onChangeText={setTlsCaPem}
                placeholder="-----BEGIN CERTIFICATE-----"
                hint="Only needed for a self-signed or private CA. Leave blank to use the system trust store."
              />
            ) : null}

            <Field
              label="Outbound proxy"
              value={outboundProxy}
              onChangeText={setOutboundProxy}
              placeholder="Optional"
            />
            <Field
              label="Register expiry"
              value={registerExpires}
              onChangeText={setRegisterExpires}
              keyboardType="number-pad"
              hint="Seconds between REGISTER refreshes"
            />
          </View>

          <SectionLabel>Advanced</SectionLabel>
          <View style={styles.group}>
            <Field
              label="Display name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Shown to the person you call"
              autoCapitalize="words"
            />
            <Field
              label="Authorization user"
              value={authorizationUser}
              onChangeText={setAuthorizationUser}
              placeholder="Only if different from username"
            />
            <Field
              label="Voicemail number"
              value={voicemailNumber}
              onChangeText={setVoicemailNumber}
              placeholder="*97"
              hint="Reached by holding 1 on the dialpad"
            />
            <Toggle
              label="Register automatically"
              value={autoRegister}
              onChange={setAutoRegister}
            />
            <Toggle
              label="Video calling"
              detail="Offer video on calls from this account"
              value={videoEnabled}
              onChange={setVideoEnabled}
            />
            <Toggle
              label="SIP INFO for DTMF"
              detail="Use SIP INFO instead of RFC 2833 in-band tones"
              value={useInfoDtmf}
              onChange={setUseInfoDtmf}
            />
          </View>

          {existing ? (
            <Pressable onPress={clearPassword} style={styles.danger}>
              <Text style={styles.dangerLabel}>Clear saved password</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cancel: { ...typography.label, color: colors.textDim },
  save: { ...typography.label, color: colors.accent },
  content: { paddingBottom: space.xxl },
  group: { paddingHorizontal: space.lg, gap: space.lg },
  field: { gap: space.xs },
  fieldLabel: { ...typography.label, color: colors.textDim },
  hint: { ...typography.caption, color: colors.textFaint },
  input: {
    paddingHorizontal: space.lg,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.text,
  },
  suggest: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  suggestLabel: { ...typography.caption, color: colors.textDim },
  danger: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
  },
  dangerLabel: { ...typography.label, color: colors.danger },
});
