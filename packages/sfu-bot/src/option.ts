import { defaultSFUApiOptions, SFUApiOptions } from './imports/sfu';

export type SFUBotPluginOptions = Omit<SFUApiOptions, 'log'> & {
  endpointTimeout: number;
  ackTimeout: number;
  disableRestartIce: boolean;
};

export const defaultSFUBotPluginOptions: SFUBotPluginOptions = {
  ...defaultSFUApiOptions,
  endpointTimeout: 30_000,
  ackTimeout: 10_000,
  disableRestartIce: false,
};
