import type { Event } from '@skyway-sdk/common';
import type { ChannelEvent } from '../imports/rpc';

export interface EventObserver {
  onEvent: Event<ChannelEvent>;

  dispose: () => void;
}
