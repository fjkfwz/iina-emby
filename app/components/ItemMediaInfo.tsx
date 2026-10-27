import { type EmbyItemMetadata, type EmbyMediaStream, isGenericOrEmptySubtitleTitle } from "@shared";
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
  zh: "Chinese",
  chi: "Chinese",
  zho: "Chinese",
  "zh-cn": "Simplified Chinese",
  "zh-hans": "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  "zh-hk": "Cantonese / Traditional",
  yue: "Cantonese",
  en: "English",
  eng: "English",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  ru: "Russian",
  rus: "Russian",
  fr: "French",
  fre: "French",
  fra: "French",
  de: "German",
  ger: "German",
  deu: "German",
  es: "Spanish",
  spa: "Spanish",
  it: "Italian",
  ita: "Italian",
  cantonese: "Cantonese",
  mandarin: "Mandarin",
  und: "Unknown",
};

function formatLanguage(lang?: string, displayLang?: string): string {
  if (displayLang && displayLang.trim()) {
    return displayLang.trim();
  }
  if (!lang) return "Unknown";
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
  if (c === "pcm" || c.includes("pcm")) return "LPCM";
  return codec.toUpperCase();
}

function formatAudioChannels(channels?: number, layout?: string): string {
  if (layout && layout.trim()) {
    return layout.trim();
  }
  if (channels === 8) return "7.1 Channels";
  if (channels === 6) return "5.1 Surround";
  if (channels === 2) return "Stereo 2.0";
  if (channels === 1) return "Mono 1.0";
  if (channels) return `${channels} Channels`;
  return "";
}

function formatBitrate(bps?: number): string | null {
  if (!bps || bps <= 0) return null;
  const kbps = Math.round(bps / 1000);
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${kbps} kbps`;
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

  const width = videoStream?.Width;
  const height = videoStream?.Height;
  let resText = t("unknown", "Unknown");
  if (width && height) {
    if (width >= 3800 || height >= 2100) resText = `4K Ultra HD (${width}×${height})`;
    else if (width >= 2500 || height >= 1400) resText = `2K Quad HD (${width}×${height})`;
    else if (width >= 1900 || height >= 1000) resText = `1080p Full HD (${width}×${height})`;
    else if (width >= 1200 || height >= 700) resText = `720p HD (${width}×${height})`;
    else resText = `${width}×${height}`;
  }

  const videoRange = videoStream?.VideoRange;
  const isHdr = videoRange?.includes("HDR") || videoRange === "HDR";
  const isDv = videoRange?.includes("DOVI") || videoRange?.includes("Dolby Vision") || videoStream?.VideoRangeType === "DOVI";
  let dynamicRange = "SDR";
  if (isDv && isHdr) dynamicRange = "Dolby Vision + HDR";
  else if (isDv) dynamicRange = "Dolby Vision";
  else if (isHdr) dynamicRange = videoRange || "HDR";

  const fps = videoStream?.RealFrameRate || videoStream?.AverageFrameRate;
  const container = mediaSource?.Container || mediaSource?.Path?.split(".").pop()?.toUpperCase() || null;
  const fileSize = formatFileSize(mediaSource?.Size ?? (item.Size as number | undefined));
  const videoBitrate = formatBitrate(videoStream?.BitRate as number | undefined);
  const overallBitrate = formatBitrate(mediaSource?.Bitrate as number | undefined);

  return (
    <section className={styles.container} aria-label={t("mediaInfo", "Media Specifications")}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>{t("mediaInfo", "Media Specifications")}</h3>
      </div>

      <div className={styles.grid}>
        {/* Video Card */}
        {videoStream && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconMovie size={18} className={styles.iconVideo} />
              <span className={styles.cardTitle}>{t("videoStream", "Video Specifications")}</span>
            </div>
            <div className={styles.specList}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>{t("resolution", "Resolution")}</span>
                <span className={styles.specValue}>{resText}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>{t("videoCodec", "Video Codec")}</span>
                <span className={styles.specValue}>
                  {videoStream.Codec?.toUpperCase() || t("unknown", "Unknown")}
                  {videoStream.Profile ? ` (${videoStream.Profile})` : ""}
                </span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>{t("colorSpace", "Color Space")}</span>
                <span className={styles.specValue}>
                  <span className={dynamicRange !== "SDR" ? styles.badgeHdr : undefined}>{dynamicRange}</span>
                </span>
              </div>
              {fps && fps > 0 && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("frameRate", "Frame Rate")}</span>
                  <span className={styles.specValue}>{fps.toFixed(fps % 1 === 0 ? 0 : 3)} FPS</span>
                </div>
              )}
              {videoBitrate && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("bitrate", "Bitrate")}</span>
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
              <span className={styles.cardTitle}>{t("audioStream", "Audio Tracks")} ({audioStreams.length})</span>
              {onSelectAudioIndex && <span className={styles.cardHeaderRight}>{t("details", "Click to switch")}</span>}
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
                    title={onSelectAudioIndex ? `${t("audio", "Audio")}: ${lang}` : undefined}
                  >
                    <div className={styles.streamRow}>
                      <div className={styles.streamInfo}>
                        <div className={styles.streamHeader}>
                          <span className={styles.streamLanguage}>{lang}</span>
                          {Boolean(audio.IsDefault) && <span className={styles.badgeDefault}>{t("default", "Default")}</span>}
                        </div>
                        {title && title !== lang && <div className={styles.streamTitle} title={title}>{title}</div>}
                        <div className={styles.streamMeta}>
                          <span>{codec}</span>
                          {channels && <span>• {channels}</span>}
                          {bitRate && <span>• {bitRate}</span>}
                        </div>
                      </div>
                      {isSelected && <span className={styles.badgeSelectedAudio}>✓ {t("selected", "Selected")}</span>}
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
              <span className={styles.cardTitle}>{t("subtitleStream", "Subtitle Tracks")} ({subtitleStreams.length})</span>
              {onSelectSubtitleIndex && <span className={styles.cardHeaderRight}>{t("details", "Click to switch")}</span>}
            </div>
            <div className={styles.streamList}>
              {onSelectSubtitleIndex && (
                <div
                  className={`${styles.streamItem} ${styles.streamItemSelectable} ${selectedSubtitleIndex === -1 ? styles.streamItemSelectedSubtitle : ""}`}
                  onClick={() => onSelectSubtitleIndex(-1)}
                  role="button"
                  tabIndex={0}
                  title={t("subtitlesOff", "Off (Disable Subtitles)")}
                >
                  <div className={styles.streamRow}>
                    <div className={styles.streamInfo}>
                      <div className={styles.streamHeader}>
                        <span className={styles.streamLanguage}>🚫 {t("subtitlesOff", "Off (Disable Subtitles)")}</span>
                      </div>
                      <div className={styles.streamMeta}>
                        <span>{t("disabled", "Disabled")}</span>
                      </div>
                    </div>
                    {selectedSubtitleIndex === -1 && <span className={styles.badgeSelectedSubtitle}>✓ {t("selected", "Selected")}</span>}
                  </div>
                </div>
              )}
              {subtitleStreams.map((sub, idx) => {
                const lang = formatLanguage(sub.Language, typeof sub.DisplayLanguage === "string" ? sub.DisplayLanguage : undefined);
                const format = sub.Codec?.toUpperCase() || "SRT";
                const isExt = Boolean(sub.IsExternal);
                const rawTitle = typeof sub.Title === "string" ? sub.Title.trim() : null;
                const title = rawTitle && !isGenericOrEmptySubtitleTitle(rawTitle) ? rawTitle : null;
                const isSelected = selectedSubtitleIndex === sub.Index;

                return (
                  <div
                    key={sub.Index ?? `sub-${idx}`}
                    className={`${styles.streamItem} ${onSelectSubtitleIndex ? styles.streamItemSelectable : ""} ${isSelected ? styles.streamItemSelectedSubtitle : ""}`}
                    onClick={() => typeof sub.Index === "number" && onSelectSubtitleIndex?.(sub.Index)}
                    role={onSelectSubtitleIndex ? "button" : undefined}
                    tabIndex={onSelectSubtitleIndex ? 0 : undefined}
                    title={onSelectSubtitleIndex ? `${t("subtitle", "Subtitle")}: ${lang}` : undefined}
                  >
                    <div className={styles.streamRow}>
                      <div className={styles.streamInfo}>
                        <div className={styles.streamHeader}>
                          <span className={styles.streamLanguage}>{lang}</span>
                          <div className={styles.streamBadges}>
                            {Boolean(sub.IsDefault) && <span className={styles.badgeDefault}>{t("default", "Default")}</span>}
                            <span className={isExt ? styles.badgeExternal : styles.badgeInternal}>
                              {isExt ? t("external", "External") : t("embedded", "Embedded")}
                            </span>
                            {format === "ASS" && <span className={styles.badgeAss}>{t("effects", "ASS")}</span>}
                          </div>
                        </div>
                        {title && title !== lang && <div className={styles.streamTitle} title={title}>{title}</div>}
                        <div className={styles.streamMeta}>
                          <span>{t("format", "Format")}: {format}</span>
                        </div>
                      </div>
                      {isSelected && <span className={styles.badgeSelectedSubtitle}>✓ {t("selected", "Selected")}</span>}
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
              <span className={styles.cardTitle}>{t("fileFormat", "Container & Specs")}</span>
            </div>
            <div className={styles.specList}>
              {container && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("fileFormat", "Container")}</span>
                  <span className={styles.specValue}>{String(container)}</span>
                </div>
              )}
              {fileSize && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("fileSize", "File Size")}</span>
                  <span className={styles.specValue}>{fileSize}</span>
                </div>
              )}
              {overallBitrate && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("totalBitrate", "Total Bitrate")}</span>
                  <span className={styles.specValue}>{overallBitrate}</span>
                </div>
              )}
              {mediaSource?.Protocol && (
                <div className={styles.specItem}>
                  <span className={styles.specLabel}>{t("protocol", "Protocol")}</span>
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
