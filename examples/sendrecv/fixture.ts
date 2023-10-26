import { SkyWayAuthToken, uuidV4 } from '@shinyoshiaki/skyway-nodejs-sdk';
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
