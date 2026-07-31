import { Werift } from '../../../../submodules/mediasoup/src/handlers/werift';

/**
 * @internal
 * @description [japanese]
 * mediasoup-client-node の werift handler は getTransportStats / getSenderStats /
 * getReceiverStats が空実装で、`undefined` を返す。js-sdk v2 は SFU の統計収集で
 * `transport.getStats()` / `producer.getStats()` / `consumer.getStats()` を使うため、
 * そのままでは統計が取得できない。
 *
 * Why ここで prototype を差し替えるか:
 * submodule 側を直接修正すると submodule の working tree が dirty になり、
 * gitlink が remote から取得できないコミットを指す状態を招く（fresh checkout / CI で
 * 再現できなくなる）。werift 自体は pc / sender / receiver の getStats を実装済みなので、
 * 本リポジトリ側で委譲するだけで足りる。
 */

// getStats の対象 transceiver が見つからない場合に返す空のレポート。
// DOM の RTCStatsReport は Map 互換なので Map を返しておけばよい。
const emptyStatsReport = (): RTCStatsReport => new Map() as RTCStatsReport;

type WeriftHandlerInternals = {
  _pc?: { getStats(): Promise<RTCStatsReport> };
  _mapMidTransceiver?: Map<
    string,
    {
      sender: { getStats(): Promise<RTCStatsReport> };
      receiver: { getStats(): Promise<RTCStatsReport> };
    }
  >;
};

const prototype = Werift.prototype as unknown as WeriftHandlerInternals & {
  getTransportStats(): Promise<RTCStatsReport>;
  getSenderStats(localId: string): Promise<RTCStatsReport>;
  getReceiverStats(localId: string): Promise<RTCStatsReport>;
};

prototype.getTransportStats = async function (
  this: WeriftHandlerInternals,
): Promise<RTCStatsReport> {
  return this._pc ? this._pc.getStats() : emptyStatsReport();
};

prototype.getSenderStats = async function (
  this: WeriftHandlerInternals,
  localId: string,
): Promise<RTCStatsReport> {
  const transceiver = this._mapMidTransceiver?.get(localId);
  return transceiver ? transceiver.sender.getStats() : emptyStatsReport();
};

prototype.getReceiverStats = async function (
  this: WeriftHandlerInternals,
  localId: string,
): Promise<RTCStatsReport> {
  const transceiver = this._mapMidTransceiver?.get(localId);
  return transceiver ? transceiver.receiver.getStats() : emptyStatsReport();
};
