import { IconCheck, IconCopy } from "@tabler/icons-react";
import type React from "react";
import { useState } from "react";
import styles from "./SystemInfo.module.css";
import { Skeleton } from "./ui";

type Props = {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  loading?: boolean;
  title?: string;
  skeletonWidth?: string;
  isCode?: boolean;
  copyable?: boolean;
  children?: React.ReactNode;
};

export function SystemInfoRow({
  icon,
  label,
  value,
  loading = false,
  title,
  skeletonWidth = "25%",
  isCode = false,
  copyable = false,
  children,
}: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof value === "string") {
      navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className={styles.row}>
      <div className={styles.rowLeft}>
        {icon && <span className={styles.rowIcon}>{icon}</span>}
        <span className={styles.rowLabel}>{label}</span>
      </div>
      <div className={styles.rowRight} style={{ minWidth: skeletonWidth }}>
        {loading ? (
          <Skeleton width="100%" radius="xs">
            <span>&nbsp;</span>
          </Skeleton>
        ) : (
          <>
            {children}
            {value !== undefined && value !== null && (
              <span
                className={`${styles.rowValue} ${isCode ? styles.codeValue : ""}`}
                title={title || (typeof value === "string" ? value : undefined)}
              >
                {value}
              </span>
            )}
            {copyable && typeof value === "string" && value !== "—" && (
              <button
                type="button"
                className={`${styles.copyBtn} ${copied ? styles.copyBtnCopied : ""}`}
                onClick={handleCopy}
                title={copied ? "Copied" : "Copy"}
                aria-label={`Copy ${label}`}
              >
                {copied ? <IconCheck size={12} stroke={2.5} /> : <IconCopy size={12} stroke={2} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
