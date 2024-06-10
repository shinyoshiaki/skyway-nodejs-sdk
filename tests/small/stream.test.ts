import { describe, it } from 'vitest';
import { MediaStreamTrack } from '../../submodules/mediasoup/src';
import { LocalVideoStream } from '../../packages/core/src';

describe('stream', () => {
  it('onDestroyed', async () => {
    const track = new MediaStreamTrack({ kind: 'video' });
    const stream = new LocalVideoStream(track);

    setTimeout(() => track.stop());
    await stream.onDestroyed.asPromise();
  });
});
