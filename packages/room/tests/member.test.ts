import { describe, expect, it } from 'vitest';
import {
  LocalAudioStream,
  LocalVideoStream,
  MediaStreamTrack,
  SkyWayContext,
  SkyWayRoom,
} from '../src';
import { testTokenString } from './fixture';
import { randomUUID } from 'crypto';

const join = async (roomName: string) => {
  const context = await SkyWayContext.Create(testTokenString);
  const room = await SkyWayRoom.FindOrCreate(context, {
    type: 'sfu',
    name: roomName,
  });
  const member = await room.join();
  return { member, room };
};

describe('member', () => {
  describe('publish/subscribe', () => {
    describe('success', () => {
      it('audio', async () => {
        try {
          const context = await SkyWayContext.Create(testTokenString);
          const room = await SkyWayRoom.Create(context, {
            type: 'sfu',
          });
          const member = await room.join();
          const track = new MediaStreamTrack({ kind: 'audio' });
          const publication = await member.publish(
            new LocalAudioStream(track),
            {
              codecCapabilities: [{ mimeType: 'audio/opus' }],
            }
          );

          await room.close();
        } catch (error) {
          throw error;
        }
      }, 60_000);

      it('h264 with parameters', async () => {
        try {
          const { member, room } = await join(randomUUID());

          const track = new MediaStreamTrack({ kind: 'video' });
          const parameters = {
            'packetization-mode': 1,
            'profile-level-id': '42e01f',
            'level-asymmetry-allowed': 1,
          };
          const publication = await member.publish(
            new LocalVideoStream(track),
            {
              codecCapabilities: [
                {
                  mimeType: 'video/h264',
                  parameters,
                },
              ],
            }
          );

          const { member: receiver } = await join(room.name!);

          const { subscription } = await receiver.subscribe(publication);
          expect(subscription.codec?.parameters).toEqual(parameters);

          await room.close();
        } catch (error) {
          throw error;
        }
      }, 600_000);
    });
  });
});
