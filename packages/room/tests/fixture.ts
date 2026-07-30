import { appId, secret } from '../../../env';
import { nowInSec, SkyWayAuthToken, uuidV4 } from '../src';

const testToken = new SkyWayAuthToken({
  jti: uuidV4(),
  iat: nowInSec(),
  exp: nowInSec() + 60 * 60 * 24,
  version: 3,
  scope: {
    appId: appId,
    rooms: [
      {
        name: '*',
        methods: ['create', 'close', 'updateMetadata'],
        member: {
          name: '*',
          methods: ['publish', 'subscribe', 'updateMetadata'],
        },
        sfu: {
          enabled: true,
        },
      },
    ],
    turn: {
      enabled: true,
    },
  },
});
export const testTokenString = testToken.encode(secret);
