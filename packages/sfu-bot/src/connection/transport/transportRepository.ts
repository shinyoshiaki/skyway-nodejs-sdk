import { Event, Logger } from '@skyway-sdk/common';
import {
  createError,
  getRuntimeInfo,
  IceManager,
  SkyWayContext,
} from '../../imports/core';
import { SfuRestApiClient } from '@skyway-sdk/sfu-api-client';

import { errors } from '../../errors';
import { SfuBotMember } from '../../member';
import { SfuTransport } from './transport';
import {
  RTCRtpCodecParameters,
  useAbsSendTime,
  useAudioLevelIndication,
  useNACK,
  usePLI,
  useREMB,
  useSdesMid,
  types,
  Device,
} from '../../imports/mediasoup';

const log = new Logger(
  'packages/sfu-bot/src/connection/transport/transportRepository.ts'
);

export class TransportRepository {
  onTransportCreated = new Event<string>();

  private readonly _device: types.Device;
  /**@private */
  _transports: { [id: string]: SfuTransport } = {};

  get rtpCapabilities() {
    if (!this._device.loaded) {
      return undefined;
    }
    return this._device.rtpCapabilities;
  }

  constructor(
    private _context: SkyWayContext,
    private readonly _api: SfuRestApiClient
  ) {
    const { browserName, browserVersion } = getRuntimeInfo({
      isNotBrowser: {
        browserName: 'nodejs',
        browserVersion: '0.0.0',
        osName: 'nodejs',
        osVersion: '0.0.0',
      },
    });
    log.debug('runtime info', { browserName, browserVersion });
    // wkwebview対応
    // if (browserName === 'Safari' && browserVersion == undefined) {
    //   this._device = new Device({ handlerName: 'Safari12' });
    // } else {
    //   this._device = new Device();
    // }

    const videoCodecs = [
      ...(() => {
        const parameters: RTCRtpCodecParameters[] = [];
        const packetizationModeArr = [0, 1];
        const profileLevelArr = ['42001f', '42e01f', '4d001f'];
        const levelAsymmetryArr = [0, 1];

        for (const packetizationMode of packetizationModeArr) {
          for (const profileLevel of profileLevelArr) {
            for (const levelAsymmetry of levelAsymmetryArr) {
              parameters.push(
                new RTCRtpCodecParameters({
                  mimeType: 'video/H264',
                  clockRate: 90000,
                  payloadType: 101,
                  rtcpFeedback: [useNACK(), usePLI(), useREMB()],
                  parameters: `packetization-mode:${packetizationMode};profile-level-id:${profileLevel};level-asymmetry-allowed:${levelAsymmetry}`,
                })
              );
            }
          }
        }
        return parameters;
      })(),
      new RTCRtpCodecParameters({
        mimeType: 'video/VP8',
        clockRate: 90000,
        payloadType: 102,
        rtcpFeedback: [useNACK(), usePLI(), useREMB()],
      }),
    ];

    this._device = new Device({
      headerExtensions: {
        video: [useSdesMid(), useAbsSendTime()],
        audio: [useSdesMid(), useAbsSendTime(), useAudioLevelIndication()],
      },
      codecs: {
        audio: [
          new RTCRtpCodecParameters({
            mimeType: 'audio/opus',
            clockRate: 48000,
            payloadType: 100,
            rtcpFeedback: [],
            channels: 2,
          }),
        ],
        video: videoCodecs,
      },
    });
  }

  async loadDevice(rtpCapabilities: types.RtpCapabilities) {
    if (!this._device.loaded) {
      await this._device
        .load({
          routerRtpCapabilities: rtpCapabilities as any,
        })
        .catch((err) => {
          throw createError({
            operationName: 'TransportRepository.loadDevice',
            context: this._context,
            info: { ...errors.internal, detail: 'loadDevice failed' },
            path: log.prefix,
            payload: { rtpCapabilities },
            error: err,
          });
        });
      log.debug('device loaded', {
        routerRtpCapabilities: rtpCapabilities,
        rtpCapabilities: this._device.rtpCapabilities,
      });
    }
  }

  /**worker内にmemberIdに紐つくTransportが無ければ新しいTransportが作られる */
  createTransport(
    personId: string,
    bot: SfuBotMember,
    transportOptions: types.TransportOptions,
    direction: 'send' | 'recv',
    iceManager: IceManager
  ) {
    const createTransport =
      direction === 'send'
        ? (o: types.TransportOptions) => this._device.createSendTransport(o)
        : (o: types.TransportOptions) => this._device.createRecvTransport(o);

    const msTransport = createTransport({
      ...transportOptions,
      iceServers: iceManager.iceServers,
      iceTransportPolicy:
        this._context.config.rtcConfig.turnPolicy === 'turnOnly'
          ? 'relay'
          : undefined,
      additionalSettings: this._context.config.rtcConfig,
    });
    const transport = new SfuTransport(
      msTransport,
      bot,
      iceManager,
      this._api,
      this._context
    );
    this._transports[personId + msTransport.id] = transport;

    this.onTransportCreated.emit(msTransport.id);

    return transport;
  }

  readonly getTransport = (personId: string, id: string) =>
    this._transports[personId + id];

  deleteTransports(personId: string) {
    Object.entries({ ...this._transports }).forEach(([id, transport]) => {
      if (id.includes(personId)) {
        transport.close();
        delete this._transports[id];
      }
    });
  }
}
