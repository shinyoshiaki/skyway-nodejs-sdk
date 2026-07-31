import { type AuthTokenV3, SkyWayAuthToken, uuidV4 } from '@skyway-sdk/token';

const TOKEN_EXPIRES_IN_SECONDS = 60 * 60 * 24;

// npm 公開版の @skyway-sdk/token では ScopeV3 と AuthTokenV3['scope'] が
// zod の型シリアライズ差で相互代入できないため、AuthTokenV3 側の型を使う。
function createForDevelopmentScopeV3(appId: string): AuthTokenV3['scope'] {
  return {
    appId,
    rooms: [
      {
        name: '*',
        methods: ['create', 'close', 'updateMetadata'],
        member: {
          name: '*',
          methods: ['publish', 'subscribe', 'updateMetadata'],
        },
      },
    ],
  };
}

export function createForDevelopmentAuthTokenString({
  appId,
  secretKey,
}: {
  appId: string;
  secretKey: string;
}): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + TOKEN_EXPIRES_IN_SECONDS;

  const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat,
    exp,
    version: 3,
    scope: createForDevelopmentScopeV3(appId),
  });

  return token.encode(secretKey);
}
