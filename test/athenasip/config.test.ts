//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import {
  fetchClientConfig,
  usableIceServers,
} from '../../src/sip/ClientConfig';
import { API_URL, OWN_SUBSCRIBERS, PASSWORD, REALM } from './fixture';

/**
 * The subscriber's configuration (`GET /api/v1/subscriber/{realm}/config`),
 * fetched by the app's own client with HTTP Digest, from the live node.
 */

const up = process.env.ATHENA_NODE_UP === '1';
const maybeIt = up ? it : it.skip;

describe('client configuration from AthenaSIP', () => {
  maybeIt('is served to the subscriber, signed with MD5 Digest', async () => {
    const config = await fetchClientConfig({
      baseUrl: API_URL,
      realm: REALM,
      username: OWN_SUBSCRIBERS[0],
      password: PASSWORD,
    });

    expect(Array.isArray(config.ice_servers)).toBe(true);
    expect(config.realm?.name.toLowerCase()).toBe(REALM.toLowerCase());
    expect(config.realm?.registration?.expires).toBeGreaterThan(0);
    // Every TURN entry the node gives comes with a live credential.
    const turn = config.ice_servers.filter(server =>
      [server.urls].flat().some(url => /^turns?:/.test(url)),
    );
    expect(usableIceServers(config.ice_servers)).toHaveLength(
      config.ice_servers.length,
    );
    for (const server of turn) {
      expect(server.username).toBeTruthy();
      expect(server.credential).toBeTruthy();
    }
  });

  maybeIt('answers each request with a fresh nonce, twice running', async () => {
    const ask = () =>
      fetchClientConfig({
        baseUrl: API_URL,
        realm: REALM,
        username: OWN_SUBSCRIBERS[0],
        password: PASSWORD,
      });
    await ask();
    await expect(ask()).resolves.toHaveProperty('ice_servers');
  });

  maybeIt('is refused for a wrong password, after one answer', async () => {
    let requests = 0;
    const counted: typeof fetch = (input, init) => {
      requests += 1;
      return fetch(input, init);
    };
    await expect(
      fetchClientConfig({
        baseUrl: API_URL,
        realm: REALM,
        username: OWN_SUBSCRIBERS[0],
        password: `${PASSWORD}-wrong`,
        fetchImpl: counted,
      }),
    ).rejects.toThrow('401');
    // One unsigned request and one wrong answer: never a second guess.
    expect(requests).toBe(2);
  });
});
