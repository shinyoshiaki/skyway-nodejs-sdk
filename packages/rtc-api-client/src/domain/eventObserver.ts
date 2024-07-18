import { Event } from '@skyway-sdk/common';
import { ChannelEvent } from '../imports/rpc';

export interface EventObserver {
  onEvent: Event<ChannelEvent>;

  dispose: () => void;
}
