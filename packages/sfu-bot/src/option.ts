import { defaultSfuApiOptions, SfuApiOptions } from './imports/sfu';

export type SfuBotPluginOptions = Omit<SfuApiOptions, 'log'> & {
  endpointTimeout: number;
  ackTimeout: number;
  disableRestartIce: boolean;
};

export const defaultSfuBotPluginOptions: SfuBotPluginOptions = {
  ...defaultSfuApiOptions,
  endpointTimeout: 30_000,
  ackTimeout: 10_000,
  disableRestartIce: false,
};
