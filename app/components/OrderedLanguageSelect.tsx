import { IconAdjustments, IconCheck, IconChevronDown, IconChevronUp, IconRotate, IconTrash, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverPosition } from "../hooks/usePopoverPosition";
import {
  AUDIO_LANGUAGES,
  DEFAULT_AUDIO_LANGUAGE_IDS,
  DEFAULT_AUDIO_LANGUAGE_STRING,
  DEFAULT_SUBTITLE_LANGUAGE_IDS,
  DEFAULT_SUBTITLE_LANGUAGE_STRING,
  moveAudioLanguageDown,
  moveAudioLanguageUp,
  parseAudioLanguageString,
  parseSubtitleLanguageString,
  SUBTITLE_LANGUAGES,
  serializeAudioLanguages,
  serializeSubtitleLanguages,
  toggleAudioLanguage,
} from "../lib/audio-languages";
import { useTranslation } from "../lib/i18n";
import styles from "./AudioLanguageSelect.module.css";

export type LanguageSelectMode = "audio" | "subtitle";

export interface OrderedLanguageSelectProps {
  mode?: LanguageSelectMode;
  value?: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function OrderedLanguageSelect({ mode = "audio", value, onChange, className, disabled = false }: OrderedLanguageSelectProps) {
  const { t, language } = useTranslation();
  const id = useId();

  const isSubtitle = mode === "subtitle";
  const availableLanguages = isSubtitle ? SUBTITLE_LANGUAGES : AUDIO_LANGUAGES;
  const defaultIds = isSubtitle ? DEFAULT_SUBTITLE_LANGUAGE_IDS : DEFAULT_AUDIO_LANGUAGE_IDS;
  const defaultString = isSubtitle ? DEFAULT_SUBTITLE_LANGUAGE_STRING : DEFAULT_AUDIO_LANGUAGE_STRING;
  const parseFn = isSubtitle ? parseSubtitleLanguageString : parseAudioLanguageString;
  const serializeFn = isSubtitle ? serializeSubtitleLanguages : serializeAudioLanguages;

  const actualValue = value ?? defaultString;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomCodes, setShowCustomCodes] = useState(false);

  const { selectedIds, customCodes } = useMemo(() => parseFn(actualValue), [actualValue, parseFn]);

  const [customInput, setCustomInput] = useState<string>(customCodes.join(","));

  useEffect(() => {
    setCustomInput(customCodes.join(","));
  }, [customCodes]);

  const { updatePosition } = usePopoverPosition({
    triggerRef,
    popoverRef,
    placement: "bottom-end",
    offset: 4,
    clampVertical: false,
  });

  // Sync position synchronously before paint, and smoothly follow page scroll
  useLayoutEffect(() => {
    if (!isOpen) return;

    updatePosition();
    const rafId = requestAnimationFrame(() => {
      updatePosition();
    });

    let scrollRafId: number | null = null;
    const root = document.getElementById("root");

    const onScrollOrResize = (e: Event) => {
      // If the scroll happened INSIDE the popover itself (e.g. scrolling the language list),
      // do not reposition or close!
      if (e.target && popoverRef.current?.contains(e.target as Node)) {
        return;
      }

      // Check if trigger button has scrolled off screen
      const tr = triggerRef.current?.getBoundingClientRect();
      if (tr && (tr.bottom < 0 || tr.top > window.innerHeight)) {
        setIsOpen(false);
        return;
      }

      if (scrollRafId !== null) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = null;
        updatePosition();
      });
    };

    window.addEventListener("resize", onScrollOrResize, { passive: true });
    window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    document.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
    root?.addEventListener("scroll", onScrollOrResize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      document.removeEventListener("scroll", onScrollOrResize, true);
      root?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Re-anchor if priority items or custom codes expansion dynamically changes container height
  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, selectedIds, showCustomCodes, updatePosition]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (popoverRef.current && !popoverRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const handleToggleLanguage = useCallback(
    (langId: string) => {
      const nextIds = toggleAudioLanguage(selectedIds, langId);
      const nextString = serializeFn(nextIds, customCodes);
      onChange(nextString);
    },
    [selectedIds, customCodes, onChange, serializeFn],
  );

  const handleMoveUp = useCallback(
    (index: number) => {
      const nextIds = moveAudioLanguageUp(selectedIds, index);
      const nextString = serializeFn(nextIds, customCodes);
      onChange(nextString);
    },
    [selectedIds, customCodes, onChange, serializeFn],
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      const nextIds = moveAudioLanguageDown(selectedIds, index);
      const nextString = serializeFn(nextIds, customCodes);
      onChange(nextString);
    },
    [selectedIds, customCodes, onChange, serializeFn],
  );

  const handleRemove = useCallback(
    (langId: string) => {
      const nextIds = selectedIds.filter((id) => id !== langId);
      const nextString = serializeFn(nextIds, customCodes);
      onChange(nextString);
    },
    [selectedIds, customCodes, onChange, serializeFn],
  );

  const handleResetDefault = useCallback(() => {
    const nextString = serializeFn(defaultIds, []);
    onChange(nextString);
  }, [defaultIds, onChange, serializeFn]);

  const handleClearAll = useCallback(() => {
    onChange("");
  }, [onChange]);

  const handleApplyCustomCodes = useCallback(() => {
    const extra = customInput
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const nextString = serializeFn(selectedIds, extra);
    onChange(nextString);
  }, [customInput, selectedIds, onChange, serializeFn]);

  const langMap = useMemo(() => new Map(availableLanguages.map((l) => [l.id, l])), [availableLanguages]);

  // Selected definitions in current sequence
  const selectedDefinitions = useMemo(
    () => selectedIds.map((id) => langMap.get(id)).filter((def): def is NonNullable<typeof def> => Boolean(def)),
    [selectedIds, langMap],
  );

  const titleText = isSubtitle
    ? t("preferredSubtitleLanguage", "Preferred Subtitle Language")
    : t("preferredAudioLanguage", "Preferred Audio Language");
  const helpText = isSubtitle
    ? t("subPriorityHelp", "Matches subtitle tracks in the order languages are checked")
    : t("audioPriorityHelp", "Matches audio tracks in the order languages are checked");
  const priorityHeaderText = isSubtitle
    ? t("subSelectedPriority", "Subtitle Priority Order")
    : t("audioSelectedPriority", "Audio Priority Order");
  const noneText = isSubtitle ? t("subLangNone", "None (Do not auto-enable subtitles)") : t("audioLangNone", "None (Video default)");
  const resetText = isSubtitle ? t("resetSubDefault", "Default (Simp/Trad/En)") : t("resetDefault", "Default (Zh/Ja/En)");

  const getPillLabel = useCallback(
    (def: (typeof availableLanguages)[number]) => {
      if (def.id === "zh-hans") {
        return language.startsWith("zh") ? "简中" : "Chinese (Simp)";
      }
      if (def.id === "zh-hant") {
        return language.startsWith("zh") ? "繁中" : "Chinese (Trad)";
      }
      return t(def.key, def.defaultLabel).split("(")[0].trim();
    },
    [language, t],
  );

  const triggerSummaryTitle = selectedDefinitions.map((def, idx) => `${idx + 1}. ${t(def.key, def.defaultLabel)}`).join(" → ");

  return (
    <div className={`${styles.container} ${className || ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={triggerSummaryTitle || noneText}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <div className={styles.triggerLeft}>
          {selectedDefinitions.length === 0 ? (
            <span className={styles.placeholder}>{noneText}</span>
          ) : (
            <>
              {selectedDefinitions.slice(0, 3).map((def, idx) => (
                <span key={def.id} className={styles.triggerPill}>
                  <span className={styles.triggerOrderBadge}>{idx + 1}</span>
                  <span>{getPillLabel(def)}</span>
                </span>
              ))}
              {selectedDefinitions.length > 3 && <span className={styles.morePill}>+{selectedDefinitions.length - 3}</span>}
            </>
          )}
        </div>
        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
          <IconChevronDown size={14} />
        </span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={id}
            role="dialog"
            aria-label={titleText}
            className={styles.dropdown}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className={styles.header}>
              <div className={styles.headerTitle}>{titleText}</div>
              <div className={styles.headerHelp}>{helpText}</div>
            </div>

            <div className={styles.scrollArea}>
              {/* Selected Priority Sequence */}
              {selectedDefinitions.length > 0 && (
                <div className={styles.sectionBlock}>
                  <div className={styles.sectionHeader}>
                    <span>{priorityHeaderText}</span>
                    <span>{selectedDefinitions.length}</span>
                  </div>
                  <div className={styles.priorityList}>
                    {selectedDefinitions.map((def, index) => (
                      <div key={def.id} className={styles.priorityItem}>
                        <div className={styles.priorityItemLeft}>
                          <span className={styles.priorityBadge}>#{index + 1}</span>
                          <span className={styles.priorityLabel}>{t(def.key, def.nativeLabel)}</span>
                        </div>
                        <div className={styles.priorityActions}>
                          <button
                            type="button"
                            className={styles.priorityBtn}
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0}
                            title={t("moveUp", "Move up")}
                            aria-label={`${t("moveUp", "Move up")} ${t(def.key, def.defaultLabel)}`}
                          >
                            <IconChevronUp size={13} />
                          </button>
                          <button
                            type="button"
                            className={styles.priorityBtn}
                            onClick={() => handleMoveDown(index)}
                            disabled={index === selectedDefinitions.length - 1}
                            title={t("moveDown", "Move down")}
                            aria-label={`${t("moveDown", "Move down")} ${t(def.key, def.defaultLabel)}`}
                          >
                            <IconChevronDown size={13} />
                          </button>
                          <button
                            type="button"
                            className={`${styles.priorityBtn} ${styles.priorityBtnRemove}`}
                            onClick={() => handleRemove(def.id)}
                            title={t("delete", "Remove")}
                            aria-label={`${t("delete", "Remove")} ${t(def.key, def.defaultLabel)}`}
                          >
                            <IconX size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Languages List */}
              <div className={styles.sectionBlock}>
                <div className={styles.sectionHeader}>
                  <span>{t("audioAvailableLanguages", "Available Languages")}</span>
                </div>
                <div className={styles.languageList}>
                  {availableLanguages.map((lang) => {
                    const isSelected = selectedIds.includes(lang.id);
                    const orderIndex = selectedIds.indexOf(lang.id);

                    return (
                      <button
                        key={lang.id}
                        type="button"
                        className={`${styles.langOption} ${isSelected ? styles.langOptionSelected : ""}`}
                        onClick={() => handleToggleLanguage(lang.id)}
                      >
                        <div className={styles.langOptionLeft}>
                          <span className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ""}`}>
                            {isSelected && <IconCheck size={11} stroke={3} />}
                          </span>
                          <div className={styles.langOptionText}>
                            <span className={styles.langNative}>{lang.nativeLabel}</span>
                            <span className={styles.langEnglish}>{t(lang.key, lang.defaultLabel)}</span>
                          </div>
                        </div>
                        {isSelected && <span className={styles.langOptionBadge}>#{orderIndex + 1}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer Operations */}
            <div className={styles.footer}>
              <div className={styles.footerActions}>
                <button type="button" className={styles.footerBtn} onClick={handleResetDefault}>
                  <IconRotate size={12} />
                  <span>{resetText}</span>
                </button>
                <button type="button" className={styles.footerBtn} onClick={handleClearAll}>
                  <IconTrash size={12} />
                  <span>{t("clearAll", "Clear")}</span>
                </button>
                <button type="button" className={styles.footerBtn} onClick={() => setShowCustomCodes((prev) => !prev)}>
                  <IconAdjustments size={12} />
                  <span>{t("customCodes", "Custom")}</span>
                </button>
              </div>

              {showCustomCodes && (
                <div className={styles.customCodesSection}>
                  <input
                    type="text"
                    className={styles.customCodesInput}
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onBlur={handleApplyCustomCodes}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleApplyCustomCodes();
                      }
                    }}
                    placeholder={isSubtitle ? "e.g. chi, zho, und" : "e.g. tlh, und, zho"}
                  />
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AudioLanguageSelect(props: Omit<OrderedLanguageSelectProps, "mode">) {
  return <OrderedLanguageSelect mode="audio" {...props} />;
}

export function SubtitleLanguageSelect(props: Omit<OrderedLanguageSelectProps, "mode">) {
  return <OrderedLanguageSelect mode="subtitle" {...props} />;
}
