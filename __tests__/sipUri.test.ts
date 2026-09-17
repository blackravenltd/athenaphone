import {
  bareUri,
  displayTarget,
  formatDuration,
  toSipUri,
} from '../src/utils/sipUri';

describe('toSipUri', () => {
  it('qualifies a bare extension with the account domain', () => {
    expect(toSipUri('1001', 'pbx.example.com')).toBe('sip:1001@pbx.example.com');
  });

  it('does not double-qualify a user@host target', () => {
    expect(toSipUri('alice@other.com', 'pbx.example.com')).toBe(
      'sip:alice@other.com',
    );
  });

  it('leaves a complete URI alone, including sips:', () => {
    expect(toSipUri('sip:bob@x.com', 'pbx.example.com')).toBe('sip:bob@x.com');
    expect(toSipUri('sips:bob@x.com', 'pbx.example.com')).toBe('sips:bob@x.com');
  });

  it('keeps the characters a PBX accepts and drops the rest', () => {
    expect(toSipUri('*97', 'pbx.example.com')).toBe('sip:*97@pbx.example.com');
    expect(toSipUri('+44 20 7946 0000', 'pbx.example.com')).toBe(
      'sip:+442079460000@pbx.example.com',
    );
    // A hyphen is legal in a SIP user part ("conf-room@..."), so it
    // survives; spaces and brackets do not.
    expect(toSipUri('(555) 123-4567', 'pbx.example.com')).toBe(
      'sip:555123-4567@pbx.example.com',
    );
    expect(toSipUri('conf-room', 'pbx.example.com')).toBe(
      'sip:conf-room@pbx.example.com',
    );
  });

  it('refuses an empty target rather than dialling the domain', () => {
    expect(() => toSipUri('   ', 'pbx.example.com')).toThrow();
    expect(() => toSipUri('()', 'pbx.example.com')).toThrow();
  });
});

describe('displayTarget', () => {
  it('reduces a URI to the user part', () => {
    expect(displayTarget('sip:1001@pbx.example.com')).toBe('1001');
    expect(displayTarget('sips:alice@example.com')).toBe('alice');
  });

  it('drops URI parameters', () => {
    expect(displayTarget('sip:1001@pbx.example.com;transport=ws')).toBe('1001');
  });
});

describe('bareUri', () => {
  it('keeps user@host but strips the scheme and parameters', () => {
    expect(bareUri('sip:alice@example.com;transport=wss')).toBe(
      'alice@example.com',
    );
  });
});

describe('formatDuration', () => {
  it('uses m:ss below an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('switches to h:mm:ss at an hour', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('floors fractional seconds and clamps negatives', () => {
    expect(formatDuration(75.9)).toBe('1:15');
    expect(formatDuration(-5)).toBe('0:00');
  });
});
