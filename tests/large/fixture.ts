import Gst from '@girs/node-gst-1.0';
import nodeGtk from 'node-gtk';

import { appId, secret } from '../../env';
import { SkyWayAuthToken, uuidV4 } from '../../packages/room/src';

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

export const gst = nodeGtk.require('Gst', '1.0') as typeof Gst;
gst.init([]);
