import { Event, Logger } from '@skyway-sdk/common';

import { errors } from './errors';
import {
  createError,
  Publication,
  SkyWayContext,
  Subscription,
} from './imports/core';
import { SfuRestApiClient } from './imports/sfu';

const log = new Logger('packages/sfu-bot/src/connection/sender.ts');

export class Forwarding {
  state: ForwardingState;
  configure: ForwardingConfigure;
  originPublication: Publication;
  relayingPublication: Publication;

  private _identifierKey: string;
  private _api: SfuRestApiClient;
  private _context: SkyWayContext;

  /** @description [japanese] forwardingが終了された時に発火するイベント */
  readonly onStopped = new Event<void>();

  /**@internal */
  constructor(
    private props: {
      configure: ForwardingConfigure;
      originPublication: Publication;
      relayingPublication: Publication;
      api: SfuRestApiClient;
      context: SkyWayContext;
      identifierKey: string;
    }
  ) {
    this.state = 'started';
    this.configure = this.props.configure;
    this.originPublication = this.props.originPublication;
    this.relayingPublication = this.props.relayingPublication;
    this._identifierKey = this.props.identifierKey;
    this._api = this.props.api;
    this._context = this.props.context;
    
    this.relayingPublication.onSubscribed.add(async (e) => {
      await this.confirmSubscription(e.subscription).catch((e) => e);
    });
    this.relayingPublication.subscriptions.forEach(async (subscription) => {
      await this.confirmSubscription(subscription).catch((e) => e);
    });
  }

  get id() {
    return this.relayingPublication.id;
  }

  /**@private */
  _stop() {
    this.state = 'stopped';
    this.onStopped.emit();
  }

  /**@internal */
  toJSON() {
    return {
      id: this.id,
      configure: this.configure,
      originPublication: this.originPublication,
      relayingPublication: this.relayingPublication,
    };
  }

  /**
   * @deprecated
   */
  async confirmSubscription(subscription: Subscription) {
    log.debug('[start] Forwarding confirmSubscription');
    const { message } = await this._api
      .confirmSubscription({
        forwardingId: this.id,
        subscriptionId: subscription.id,
        identifierKey: this._identifierKey,
      })
      .catch((error) => {
        log.error('Forwarding confirmSubscription failed:', error);
        throw createError({
          operationName: 'Forwarding.confirmSubscription',
          context: this._context,
          info: errors.confirmSubscriptionFailed,
          path: log.prefix,
          payload: error,
        });
      });
    log.debug('[end] Forwarding confirmSubscription', { message });
  }
}

export type ForwardingState = 'started' | 'stopped';

export interface ForwardingConfigure {
  maxSubscribers: number;
}
