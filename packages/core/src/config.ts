import { LogFormat, LogLevel } from '@skyway-sdk/common';
import { RtcApiConfig, RtcRpcApiConfig } from './imports/rtcApi';
import deepmerge from 'deepmerge';
import { Codec } from './media';

export { RtcApiConfig, RtcRpcApiConfig };

export type SkyWayConfigOptions = {
  /**@internal */
  rtcApi: RtcApiConfig;
  /**@internal */
  iceParamServer: { domain?: string; version?: number; secure?: boolean };
  /**@internal */
  signalingService: { domain?: string; secure?: boolean };
  rtcConfig: {
    encodedInsertableStreams?: boolean;
    /**
     * @internal
     * @description ms
     * */
    timeout?: number;
    turnPolicy?: TurnPolicy;
    turnProtocol?: TurnProtocol;
    /**
     * @internal
     * @description ms
     * */
    iceDisconnectBufferTimeout?: number;
  };
  token: { updateReminderSec?: number };
  log: Partial<{ level: LogLevel; format: LogFormat }>;
  /**@internal */
  internal: { disableDPlane?: boolean };
  member: Partial<MemberKeepAliveConfig>;
  codecCapabilities: Codec[];
};

/**
 * @description [japanese] MemberのChannelとのKeepAliveに関する設定
 * @description [japanese]
 * Memberはブラウザのタブを閉じるとChannelから削除される。
 * iOS safariのようなbeforeunloadイベントに対応していないブラウザは、
 * タブを閉じたあと keepaliveIntervalSec + keepaliveIntervalGapSec 秒後に
 * Channelから削除される。
 */
export type MemberKeepAliveConfig = {
  /**@description [japanese] KeepAliveを行う周期 */
  keepaliveIntervalSec: number;
  /**@description [japanese] KeepAliveの周期を超えてChannelからMemberが削除されるまでの時間 */
  keepaliveIntervalGapSec: number;
};

/**@internal */
export type MemberInternalConfig = {
  /**@internal */
  disableSignaling?: boolean;
};

export type TurnPolicy = 'enable' | 'disable' | 'turnOnly';

export type TurnProtocol = 'all' | 'udp' | 'tcp' | 'tls';

export class ContextConfig implements SkyWayConfigOptions {
  /**@internal */
  rtcApi: Required<SkyWayConfigOptions['rtcApi']> = {
    domain: 'rtc-api.skyway.ntt.com',
    timeout: 30_000,
    secure: true,
    eventSubscribeTimeout: 5000,
  };
  /**@internal */
  iceParamServer: Required<SkyWayConfigOptions['iceParamServer']> = {
    domain: 'ice-params.skyway.ntt.com',
    version: 1,
    secure: true,
  };
  /**@internal */
  signalingService: Required<SkyWayConfigOptions['signalingService']> = {
    domain: 'signaling.skyway.ntt.com',
    secure: true,
  };
  rtcConfig: Required<SkyWayConfigOptions['rtcConfig']> = {
    timeout: 30_000,
    turnPolicy: 'enable',
    turnProtocol: 'all',
    encodedInsertableStreams: false,
    iceDisconnectBufferTimeout: 5000,
  };
  token: Required<SkyWayConfigOptions['token']> = {
    updateReminderSec: 30,
  };
  log: Required<SkyWayConfigOptions['log']> = {
    level: 'error',
    format: 'string',
  };
  /**@internal */
  internal: Required<SkyWayConfigOptions['internal']> = {
    disableDPlane: false,
  };
  member: Required<SkyWayConfigOptions['member']> = {
    keepaliveIntervalGapSec: 30,
    keepaliveIntervalSec: 30,
  };
  codecCapabilities: Codec[];

  /**@internal */
  constructor(options: Partial<SkyWayConfigOptions> = {}) {
    Object.assign(this, deepmerge(this, options));
  }
}
