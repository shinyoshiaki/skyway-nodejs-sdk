export type Codec = {
  /**
   * The codec MIME media type/subtype (e.g. 'audio/opus', 'video/VP8').
   */
  mimeType: string;
  /**
   * The preferred RTP payload type.
   */
  preferredPayloadType?: number;
  /**
   * The number of channels supported (e.g. two for stereo). Just for audio.
   * Default 1.
   */
  channels?: number;
  /**
   * Codec specific parameters. Some parameters (such as 'packetization-mode'
   * and 'profile-level-id' in H264 or 'profile-id' in VP9) are critical for
   * codec matching.
   */
  parameters?: Partial<CodecParameters>;
};

export type CodecParameters = {
  [key: string]: any;
  /** @description [japanese] 発話していない時の音声通信を停止する。デフォルトで有効 */
  usedtx: boolean | number;
};

export type DataType = string | Blob | ArrayBuffer;

export type EncodingParameters = {
  /** @description [japanese] エンコード設定の選択をする場合は事前にIDを設定する必要がある */
  id?: string;
  /** @description [japanese] 単位は bps  */
  maxBitrate?: number;
  /**
   * @description
   * [japanese] 基準の解像度から値で割った解像度を設定する。値は1以上である必要がある
   * @link https://www.w3.org/TR/webrtc/#dom-rtcrtpencodingparameters-scaleresolutiondownby
   */
  scaleResolutionDownBy?: number;
  /**
   * @description
   * [japanese] 最大フレームレートをフレーム/秒単位で指定する
   * @link https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpEncodingParameters/maxFramerate
   */
  maxFramerate?: number;
};
