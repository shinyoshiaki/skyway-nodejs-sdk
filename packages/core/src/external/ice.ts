import { BackOff, HttpClient, Logger } from '@skyway-sdk/common';

import { SkyWayContext } from '../context';
import { RTCIceServer } from '../imports/mediasoup';

const log = new Logger('packages/core/src/external/ice.ts');

/**@internal */
export class IceManager {
  readonly domain: string;
  readonly version: number;
  readonly secure: boolean;
  readonly memberId: string;
  readonly channelId: string;
  readonly ttl: number;
  readonly context: SkyWayContext;

  private _stunServers: RTCIceServer[] = [];
  private _turnServers: RTCIceServer[] = [];
  private readonly _endpoint: string;
  readonly http: HttpClient;

  constructor(
    private args: {
      domain: string;
      version: number;
      secure: boolean;
      memberId: string;
      channelId: string;
      ttl?: number;
      context: SkyWayContext;
    }
  ) {
    this.domain = this.args.domain;
    this.version = this.args.version;
    this.secure = this.args.secure;
    this.memberId = this.args.memberId;
    this.channelId = this.args.channelId;
    this.ttl = this.args.ttl;
    this.context = this.args.context;
    this._endpoint = `http${this.secure ? 's' : ''}://${this.domain}/v${
      this.version
    }`;
    this.http = new HttpClient(this._endpoint);
  }

  async updateIceParams() {
    const body = {
      memberId: this.memberId,
      channelId: this.channelId,
      ttl: this.ttl,
    };
    log.debug('[start] fetch iceParams');

    const backoff = new BackOff({ times: 6, interval: 500, jitter: 100 });
    const { turn, stun } = await this.http.post<{
      turn?: {
        username: string;
        credential: string;
        domain: string;
        port: number;
      };
      stun: { domain: string; port: number };
    }>(`/ice-params`, body, {
      headers: { authorization: `Bearer ${this.context.authTokenString}` },
      retry: () => backoff.wait(),
    });

    if (turn) {
      this._turnServers = [
        {
          credential: turn.credential,
          urls: `turn:${turn.domain}:${turn.port}?transport=tcp`,
          username: turn.username,
        },
        {
          credential: turn.credential,
          urls: `turn:${turn.domain}:${turn.port}?transport=udp`,
          username: turn.username,
        },
        {
          credential: turn.credential,
          urls: `turns:${turn.domain}:${turn.port}?transport=tcp`,
          username: turn.username,
        },
      ];
    }
    this._stunServers = [{ urls: `stun:${stun.domain}:${stun.port}` }];

    log.debug('[end] fetch iceParams', { turn, stun });
  }

  get iceServers(): RTCIceServer[] {
    let iceServers: RTCIceServer[] = [...this._stunServers];
    const turnServers = this._turnServers.filter((t) => {
      const url = t.urls as string;
      switch (this.context.config.rtcConfig.turnProtocol) {
        case 'all':
          return true;
        case 'udp':
          return url.endsWith('udp');
        case 'tcp':
          return !url.startsWith('turns') && url.endsWith('tcp');
        case 'tls':
          return url.startsWith('turns');
      }
    });

    if (this.context.config.rtcConfig.turnPolicy !== 'disable') {
      iceServers = [...iceServers, ...turnServers];
    }

    return iceServers;
  }
}
