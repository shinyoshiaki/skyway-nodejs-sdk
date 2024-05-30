import { writeFileSync } from 'fs';

const { APP_ID, SECRET } = process.env;

writeFileSync(
  'env.ts',
  `export const appId = '${APP_ID}';

export const secret = '${SECRET}';
`
);
