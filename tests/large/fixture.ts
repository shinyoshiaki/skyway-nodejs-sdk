import Gst from '@girs/node-gst-1.0';

import { SkyWayAuthToken, uuidV4 } from '../../packages/room/src';
import { appId, secret } from '../../env';

const testToken = new SkyWayAuthToken({
  jti: uuidV4(),
  exp: Date.now() / 1000 + 60 * 60,
  iat: Date.now() / 1000,
  scope: {
    app: {
      turn: true,
      id: appId,
      actions: ['read'],
      channels: [
        {
          id: '*',
          name: '*',
          actions: ['read', 'write'],
          members: [
            {
              id: '*',
              name: '*',
              actions: ['write'],
              publication: {
                actions: ['write'],
              },
              subscription: {
                actions: ['write'],
              },
            },
          ],
          sfuBots: [
            {
              actions: ['write'],
              forwardings: [
                {
                  actions: ['write'],
                },
              ],
            },
          ],
        },
      ],
    },
  },
});
export const testTokenString = testToken.encode(secret);

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const gst = require('node-gtk').require('Gst', '1.0') as typeof Gst;
gst.init([]);
