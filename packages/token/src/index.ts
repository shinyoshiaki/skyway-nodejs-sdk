/**@internal */
const uuidV4 = () => globalThis.crypto.randomUUID();

export * from './encoder';
export * from './scope/sfu';
export * from './scope/v1-2';
export * from './scope/v3';
export * from './token';
export { uuidV4 };
export * from './errors';
export * from './util';
