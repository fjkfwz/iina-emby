import type { EmbyItemMetadata, EmbyServer, RemoteSearchQuery, RemoteSearchResult } from "@shared";
import { IconAlertCircle, IconCheck, IconLoader2, IconMovie, IconSearch } from "@tabler/icons-react";
import type React from "react";
import { useEffect, useState } from "react";
import { applyRemoteSearchResult, searchRemoteItem } from "../lib/emby-library-client";
import { useTranslation } from "../lib/i18n";
import styles from "./IdentifyModal.module.css";
import { Alert, Button, Input, Modal } from "./ui";

export interface IdentifyModalProps {
  opened: boolean;
  onClose: () => void;
  item: EmbyItemMetadata | null;
  server: EmbyServer;
  onSuccess?: (result?: RemoteSearchResult) => void;
}

export function IdentifyModal({ opened, onClose, item, server, onSuccess }: IdentifyModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [imdbId, setImdbId] = useState("");
  const [tmdbId, setTmdbId] = useState("");
  const [tvdbId, setTvdbId] = useState("");
  const [replaceAllImages, setReplaceAllImages] = useState(true);

  const [isSearching, setIsSearching] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RemoteSearchResult[] | null>(null);
  const [selectedResult, setSelectedResult] = useState<RemoteSearchResult | null>(null);

  // Synchronize initial values when modal opens or item changes.
  // Pre-fill only the title; provider IDs and year are left blank so search is not locked to the wrong item.
  useEffect(() => {
    if (opened && item) {
      setTitle(item.Name || item.OriginalTitle || "");
      setYear("");
      setImdbId("");
      setTmdbId("");
      setTvdbId("");
      setResults(null);
      setSelectedResult(null);
      setError(null);
      setIsSearching(false);
      setIsApplying(false);
    }
  }, [opened, item]);

  if (!item) return null;

  const itemType = item.Type || "Movie";

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim() && !imdbId.trim() && !tmdbId.trim() && !tvdbId.trim()) {
      setError("Please provide a title or at least one provider ID.");
      return;
    }

    setIsSearching(true);
    setError(null);
    setSelectedResult(null);

    const providerIds: Record<string, string> = {};
    if (imdbId.trim()) providerIds.Imdb = imdbId.trim();
    if (tmdbId.trim()) providerIds.Tmdb = tmdbId.trim();
    if (tvdbId.trim()) providerIds.Tvdb = tvdbId.trim();

    const parsedYear = Number.parseInt(year.trim(), 10);

    const query: RemoteSearchQuery = {
      SearchInfo: {
        Name: title.trim() || undefined,
        Year: Number.isFinite(parsedYear) ? parsedYear : undefined,
        ProviderIds: Object.keys(providerIds).length > 0 ? providerIds : undefined,
      },
      ItemId: item.Id,
    };

    try {
      const searchResults = await searchRemoteItem(server, itemType, query);
      setResults(searchResults);
      if (searchResults.length > 0) {
        setSelectedResult(searchResults[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to search metadata.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleApply = async () => {
    if (!selectedResult || isApplying) return;

    setIsApplying(true);
    setError(null);

    try {
      console.log(`[Identify] Applying remote search result for item ${item.Id}:`, selectedResult);
      await applyRemoteSearchResult(server, item.Id, selectedResult, replaceAllImages);
      console.log(`[Identify] Remote search applied successfully for item ${item.Id}. Invoking onSuccess callback with result.`);
      onSuccess?.(selectedResult);
      onClose();
    } catch (err: unknown) {
      console.error(`[Identify] Failed to apply remote search for item ${item.Id}:`, err);
      setError(err instanceof Error ? err.message : "Failed to apply identification.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="38rem"
      withCloseButton={true}
      classNames={{
        content: styles.modalContent,
      }}
    >
      <div className={styles.modalBody}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerTitleGroup}>
            <h3 className={styles.modalTitle}>{t("identify", "Identify")}</h3>
            <span className={styles.typeBadge}>{itemType}</span>
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className={styles.formSection}>
          {error && (
            <Alert
              icon={<IconAlertCircle size={15} />}
              title="Error"
              styles={{
                root: {
                  backgroundColor: "var(--danger-bg)",
                  borderColor: "var(--danger-border)",
                  padding: "0.375rem 0.625rem",
                  borderRadius: "var(--radius-m)",
                },
                message: { fontSize: "var(--font-size-sub)" },
                title: { fontSize: "var(--font-size-sub)", fontWeight: 600 },
              }}
            >
              {error}
            </Alert>
          )}

          <div className={styles.inputRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="identify-title">
                {t("titleField", "Title")}
              </label>
              <Input
                id="identify-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Media title..."
              />
            </div>

            <div className={styles.fieldGroupSmall}>
              <label className={styles.fieldLabel} htmlFor="identify-year">
                {t("yearField", "Year")}
              </label>
              <Input id="identify-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="YYYY" />
            </div>
          </div>

          <div className={styles.idFieldsGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="identify-imdb">
                IMDb ID
              </label>
              <Input id="identify-imdb" type="text" value={imdbId} onChange={(e) => setImdbId(e.target.value)} placeholder="tt..." />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="identify-tmdb">
                TheMovieDb ID
              </label>
              <Input id="identify-tmdb" type="text" value={tmdbId} onChange={(e) => setTmdbId(e.target.value)} placeholder="ID..." />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor="identify-tvdb">
                TheTVDB ID
              </label>
              <Input id="identify-tvdb" type="text" value={tvdbId} onChange={(e) => setTvdbId(e.target.value)} placeholder="ID..." />
            </div>
          </div>

          <div className={styles.searchActions}>
            <Button type="submit" size="sm" disabled={isSearching || isApplying}>
              {isSearching ? <IconLoader2 size={14} className={styles.spinning} /> : <IconSearch size={14} />}
              <span>{isSearching ? t("searching", "Searching...") : t("search", "Search")}</span>
            </Button>
          </div>
        </form>

        {/* Results List */}
        <div className={styles.resultsSection}>
          {isSearching ? (
            <div className={styles.stateBox}>
              <IconLoader2 size={28} className={styles.spinning} />
              <span>{t("searchingMetadata", "Searching metadata...")}</span>
            </div>
          ) : results === null ? (
            <div className={styles.stateBox}>
              <IconSearch size={32} stroke={1.5} />
              <span>{t("searchMetadataHint", "Search above to find and match metadata for this item")}</span>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.stateBox}>
              <IconMovie size={32} stroke={1.5} />
              <span>{t("noIdentifyResults", "No results found. Try adjusting title, year, or provider IDs.")}</span>
            </div>
          ) : (
            results.map((res, index) => {
              const isSelected = selectedResult === res;
              const providerList = Object.entries(res.ProviderIds || {});

              return (
                <button
                  type="button"
                  key={`${res.Name}-${res.ProductionYear}-${index}`}
                  className={`${styles.resultCard} ${isSelected ? styles.resultCardSelected : ""}`}
                  onClick={() => setSelectedResult(res)}
                >
                  <div className={styles.resultThumb}>
                    {res.ImageUrl ? (
                      <img
                        src={res.ImageUrl}
                        alt={res.Name || "Poster"}
                        className={styles.resultThumbImg}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <IconMovie size={24} stroke={1.5} />
                    )}
                  </div>

                  <div className={styles.resultInfo}>
                    <div className={styles.resultTitleRow}>
                      <span className={styles.resultTitle}>{res.Name}</span>
                      {res.ProductionYear ? <span className={styles.resultYear}>({res.ProductionYear})</span> : null}
                    </div>

                    {providerList.length > 0 && (
                      <div className={styles.resultProviderRow}>
                        {providerList.map(([prov, idVal]) => (
                          <span key={prov} className={styles.providerBadge}>
                            {prov}: {String(idVal)}
                          </span>
                        ))}
                      </div>
                    )}

                    {res.Overview && <p className={styles.resultOverview}>{res.Overview}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={replaceAllImages}
              onChange={(e) => setReplaceAllImages(e.target.checked)}
              disabled={isApplying}
            />
            <span>{t("replaceAllImages", "Replace existing images")}</span>
          </label>

          <div className={styles.footerActions}>
            <Button type="button" size="sm" onClick={onClose} disabled={isApplying}>
              {t("cancel", "Cancel")}
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleApply} disabled={!selectedResult || isApplying || isSearching}>
              {isApplying ? (
                <>
                  <IconLoader2 size={14} className={styles.spinning} />
                  <span>{t("searching", "Applying...")}</span>
                </>
              ) : (
                <>
                  <IconCheck size={14} stroke={2.5} />
                  <span>{t("apply", "Apply")}</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
