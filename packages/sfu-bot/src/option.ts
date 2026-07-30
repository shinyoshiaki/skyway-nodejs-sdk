import {
  defaultSFUApiOptions,
  type SFUApiOptions,
} from './imports/sfu';

export interface SFUAdditionalOptions {
  endpointTimeout: number;
  ackTimeout: number;
  disableRestartIce: boolean;
  /** @internal */
  forceTCP: boolean;
}

export type SFUBotPluginOptions = Omit<SFUApiOptions, 'log'> &
  SFUAdditionalOptions;

export const defaultSFUBotPluginOptions: SFUBotPluginOptions = {
  ...defaultSFUApiOptions,
  endpointTimeout: 30_000,
  ackTimeout: 10_000,
  disableRestartIce: false,
  forceTCP: false,
};
