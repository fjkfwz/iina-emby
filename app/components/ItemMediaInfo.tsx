import type { EmbyItemMetadata, EmbyMediaStream } from "@shared";
import { IconDeviceTv, IconFileInfo, IconMovie, IconSubtitles, IconVolume } from "@tabler/icons-react";
import { useTranslation } from "../lib/i18n";
import styles from "./ItemMediaInfo.module.css";

interface ItemMediaInfoProps {
  item?: EmbyItemMetadata;
  selectedAudioIndex?: number;
  onSelectAudioIndex?: (index: number) => void;
  selectedSubtitleIndex?: number;
  onSelectSubtitleIndex?: (index: number) => void;
}

const LANG_MAP: Record<string, string> = {
  zh: "中文",
  chi: "中文",
  zho: "中文",
  "zh-cn": "简体中文",
  "zh-hans": "简体中文",
  "zh-tw": "繁体中文",
  "zh-hant": "繁体中文",
  "zh-hk": "粤语 / 繁中",
  yue: "粤语",
  en: "英语",
  eng: "英语",
  ja: "日语",
  jpn: "日语",
  ko: "韩语",
  kor: "韩语",
  ru: "俄语",
  rus: "俄语",
  fr: "法语",
  fre: "法语",
  fra: "法语",
  de: "德语",
  ger: "德语",
  deu: "德语",
  es: "西班牙语",
  spa: "西班牙语",
  it: "意大利语",
  ita: "意大利语",
  cantonese: "粤语",
  mandarin: "国语 / 普通话",
  und: "未知语言",
};

function formatLanguage(lang?: string, displayLang?: string): string {
  if (displayLang && displayLang.trim()) {
    return displayLang.trim();
  }
  if (!lang) return "未知语言";
  const clean = lang.toLowerCase().trim();
  return LANG_MAP[clean] || lang.toUpperCase();
}

function formatAudioCodec(codec?: string, profile?: string): string {
  if (!codec) return "Audio";
  const c = codec.toLowerCase();
  if (c === "truehd") return "Dolby TrueHD";
  if (c === "dca" || c === "dts") return profile?.toLowerCase().includes("ma") ? "DTS-HD MA" : "DTS";
  if (c === "eac3") return "Dolby Digital Plus (E-AC-3)";
  if (c === "ac3") return "Dolby Digital (AC-3)";
  if (c === "aac") return "AAC";
  if (c === "flac") return "FLAC";
  if (c === "opus") return "Opus";
  if (c === "mp3") return "MP3";
  return codec.toUpperCase();
}

function formatAudioChannels(channels?: number, layout?: string): string {
  if (channels === 8) return "7.1 声道";
  if (channels === 6) return "5.1 环绕声";
  if (channels === 2) return "立体声 2.0";
  if (channels === 1) return "单声道 1.0";
  if (layout) return layout;
  if (channels) return `${channels} 声道`;
  return "";
}

function formatBitrate(bps?: number): string | null {
  if (!bps || bps <= 0) return null;
  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  }
  return `${Math.round(bps / 1_000)} kbps`;
}

function formatFileSize(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(2)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function ItemMediaInfo({
  item,
  selectedAudioIndex,
  onSelectAudioIndex,
  selectedSubtitleIndex,
  onSelectSubtitleIndex,
}: ItemMediaInfoProps) {
  const { t } = useTranslation();
  if (!item) return null;

  const mediaSource = item.MediaSources?.[0];
  const streams: EmbyMediaStream[] =
    Array.isArray(item.MediaStreams) && item.MediaStreams.length > 0
      ? item.MediaStreams
      : Array.isArray(mediaSource?.MediaStreams)
        ? (mediaSource.MediaStreams as EmbyMediaStream[])
        : [];

  const videoStream = streams.find((s) => s.Type === "Video");
  const audioStreams = streams.filter((s) => s.Type === "Audio");
  const subtitleStreams = streams.filter((s) => s.Type === "Subtitle");

  if (!videoStream && audioStreams.length === 0 && subtitleStreams.length === 0) {
    return null;
  }

  // Video resolution label
  let resText = "未知";
  if (videoStream?.Width && videoStream.Height) {
    if (videoStream.Width >= 3800) {
      resText = `4K UHD (${videoStream.Width} × ${videoStream.Height})`;
    } else if (videoStream.Width >= 1900) {
      resText = `1080p FHD (${videoStream.Width} × ${videoStream.Height})`;
    } else if (videoStream.Width >= 1200) {
      resText = `720p HD (${videoStream.Width} × ${videoStream.Height})`;
    } else {
      resText = `${videoStream.Width} × ${videoStream.Height}`;
    }
  }

  // HDR range
  const subType = videoStream?.ExtendedVideoSubType as string | undefined;
  let dynamicRange = "SDR";
  if (subType === "DoviProfile81" || subType?.includes("Dovi")) {
    dynamicRange = "Dolby Vision (P8.1)";
  } else if (videoStream?.VideoRange === "DolbyVision") {
    dynamicRange = "Dolby Vision";
  } else if (videoStream?.VideoRange === "HDR" || String(videoStream?.VideoRange).includes("HDR")) {
    dynamicRange = "HDR10";
  }

  const fps = (videoStream?.RealFrameRate as number | undefined) || (videoStream?.AverageFrameRate as number | undefined);
  const container = mediaSource?.Container || mediaSource?.Path?.split(".").pop()?.toUpperCase() || null;
  const fileSize = formatFileSize(mediaSource?.Size ?? (item.Size as number | undefined));
  const videoBitrate = formatBitrate(videoStream?.BitRate as number | undefined);
  const overallBitrate = formatBitrate(mediaSource?.Bitrate as number | undefined);

  return (
    <section className={styles.container} aria-label="媒体规格与流信息">
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>媒体详情</h3>
      </div>

      <div className={styles.grid}>
        {/* Video Card */}
        {videoStream && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconMovie size={18} className={styles.iconVideo} />
              <span className={styles.cardTitle}>视频规格</span>
            </div>
            <div className={styles.specList}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>分辨率</span>
                <span className={styles.specValue}>{resText}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>视频编码</span>
                <span className={styles.specValue}>
                  {videoStream.Codec?.toUpperCase() || "未知"}
                  {videoStream.Profile ? ` (${videoStream.Profile})` : ""}
                </span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>色彩动态范围</span>
                <span className={styles.specValue}>
                  <span className={dynamicRange !== "SDR" ? styles.badgeHdr : undefined}>{dynamicRange}</span>
                </span>
              </div>
              {fps && fps > 0 && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>帧率</span>
                  <span className={styles.specValue}>{fps.toFixed(fps % 1 === 0 ? 0 : 3)} FPS</span>
                </div>
              )}
              {videoBitrate && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>视频码率</span>
                  <span className={styles.specValue}>{videoBitrate}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Tracks Card */}
        {audioStreams.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconVolume size={18} className={styles.iconAudio} />
              <span className={styles.cardTitle}>音频轨道 ({audioStreams.length})</span>
              {onSelectAudioIndex && <span className={styles.cardHeaderRight}>点击切换播放</span>}
            </div>
            <div className={styles.streamList}>
              {audioStreams.map((audio, idx) => {
                const lang = formatLanguage(audio.Language, typeof audio.DisplayLanguage === "string" ? audio.DisplayLanguage : undefined);
                const codec = formatAudioCodec(audio.Codec, typeof audio.Profile === "string" ? audio.Profile : undefined);
                const channels = formatAudioChannels(audio.Channels as number | undefined, typeof audio.ChannelLayout === "string" ? audio.ChannelLayout : undefined);
                const bitRate = formatBitrate(audio.BitRate as number | undefined);
                const title = typeof audio.Title === "string" ? audio.Title : null;
                const isSelected = selectedAudioIndex === audio.Index;

                return (
                  <div
                    key={audio.Index ?? `audio-${idx}`}
                    className={`${styles.streamItem} ${onSelectAudioIndex ? styles.streamItemSelectable : ""} ${isSelected ? styles.streamItemSelectedAudio : ""}`}
                    onClick={() => typeof audio.Index === "number" && onSelectAudioIndex?.(audio.Index)}
                    role={onSelectAudioIndex ? "button" : undefined}
                    tabIndex={onSelectAudioIndex ? 0 : undefined}
                    title={onSelectAudioIndex ? `点击选择播放该音轨: ${lang}` : undefined}
                  >
                    <div className={styles.streamMain}>
                      <span className={styles.streamLanguage}>{lang}</span>
                      {Boolean(audio.IsDefault) && <span className={styles.badgeDefault}>默认</span>}
                      {title && <span className={styles.streamNote}>{title}</span>}
                      {isSelected && <span className={styles.badgeSelectedAudio}>✓ 已选</span>}
                    </div>
                    <div className={styles.streamMeta}>
                      <span>{codec}</span>
                      {channels && <span>• {channels}</span>}
                      {bitRate && <span>• {bitRate}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Subtitles Card */}
        {subtitleStreams.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconSubtitles size={18} className={styles.iconSubtitles} />
              <span className={styles.cardTitle}>{t("subtitle", "字幕")} ({subtitleStreams.length})</span>
              {onSelectSubtitleIndex && <span className={styles.cardHeaderRight}>{t("details", "点击切换")}</span>}
            </div>
            <div className={styles.streamList}>
              {onSelectSubtitleIndex && (
                <div
                  className={`${styles.streamItem} ${styles.streamItemSelectable} ${selectedSubtitleIndex === -1 ? styles.streamItemSelectedSubtitle : ""}`}
                  onClick={() => onSelectSubtitleIndex(-1)}
                  role="button"
                  tabIndex={0}
                  title="关闭字幕"
                >
                  <div className={styles.streamMain}>
                    <span className={styles.streamLanguage}>🚫 {t("subtitlesOff", "不显示字幕 (关闭字幕)")}</span>
                    {selectedSubtitleIndex === -1 && <span className={styles.badgeSelectedSubtitle}>✓ {t("selected", "已选")}</span>}
                  </div>
                  <div className={styles.streamMeta}>
                    <span>{t("disabled", "关闭字幕")}</span>
                  </div>
                </div>
              )}
              {subtitleStreams.map((sub, idx) => {
                const lang = formatLanguage(sub.Language, typeof sub.DisplayLanguage === "string" ? sub.DisplayLanguage : undefined);
                const format = sub.Codec?.toUpperCase() || "SRT";
                const isExt = Boolean(sub.IsExternal);
                const title = typeof sub.Title === "string" ? sub.Title : null;
                const isSelected = selectedSubtitleIndex === sub.Index;

                return (
                  <div
                    key={sub.Index ?? `sub-${idx}`}
                    className={`${styles.streamItem} ${onSelectSubtitleIndex ? styles.streamItemSelectable : ""} ${isSelected ? styles.streamItemSelectedSubtitle : ""}`}
                    onClick={() => typeof sub.Index === "number" && onSelectSubtitleIndex?.(sub.Index)}
                    role={onSelectSubtitleIndex ? "button" : undefined}
                    tabIndex={onSelectSubtitleIndex ? 0 : undefined}
                    title={onSelectSubtitleIndex ? `点击选择播放该字幕: ${lang}` : undefined}
                  >
                    <div className={styles.streamMain}>
                      <span className={styles.streamLanguage}>{lang}</span>
                      {Boolean(sub.IsDefault) && <span className={styles.badgeDefault}>默认</span>}
                      <span className={isExt ? styles.badgeExternal : styles.badgeInternal}>{isExt ? "外挂" : "内置"}</span>
                      {format === "ASS" && <span className={styles.badgeAss}>特效</span>}
                      {title && title !== lang && <span className={styles.streamNote}>{title}</span>}
                      {isSelected && <span className={styles.badgeSelectedSubtitle}>✓ {t("selected", "已选")}</span>}
                    </div>
                    <div className={styles.streamMeta}>
                      <span>格式: {format}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* File & Source Card */}
        {(container || fileSize || overallBitrate) && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconFileInfo size={18} className={styles.iconFile} />
              <span className={styles.cardTitle}>文件规格</span>
            </div>
            <div className={styles.specList}>
              {container && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>封装格式</span>
                  <span className={styles.specValue}>{String(container)}</span>
                </div>
              )}
              {fileSize && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>文件体积</span>
                  <span className={styles.specValue}>{fileSize}</span>
                </div>
              )}
              {overallBitrate && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>总码率</span>
                  <span className={styles.specValue}>{overallBitrate}</span>
                </div>
              )}
              {mediaSource?.Protocol && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>传输协议</span>
                  <span className={styles.specValue}>{mediaSource.Protocol}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
