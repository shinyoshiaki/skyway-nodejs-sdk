import { Logger } from '@skyway-sdk/common';

import { errors } from '../../errors';
import type { MediaStreamTrack } from '../../imports/mediasoup';
import { createError } from '../../util';

const log = new Logger('packages/core/src/media/stream/audioLevel.ts');

/**
 * @internal
 * @description [japanese]
 * 本家 SDK の AudioLevel は Web Audio API (AudioContext / AnalyserNode) に依存しており、
 * werift ベースの Node.js 環境には相当する API が無いため利用できない。
 * 型と公開 API はブラウザ版に合わせたまま、使われた時点で明示的なエラーにする。
 */
export class AudioLevel {
  constructor(_audioStreamTrack: MediaStreamTrack) {
    throw createError({
      operationName: 'AudioLevel.constructor',
      info: {
        ...errors.notSupportedInNodejs,
        detail: 'getAudioLevelはWeb Audio APIに依存するため利用できません',
      },
      path: log.prefix,
    });
  }

  async [Symbol.dispose](): Promise<void> {}

  calculate(): number {
    return 0;
  }
}
