import type { EmbyServer } from "@shared";
import {
  IconAlertCircle,
  IconEditCircle,
  IconEye,
  IconEyeOff,
  IconLoader2,
  IconLock,
  IconServer,
  IconUser,
  IconWorld,
} from "@tabler/icons-react";
import type React from "react";
import { useEffect, useState } from "react";
import { authenticateByName, cleanServerUrl, verifyServerSession } from "../lib/emby-auth-client";
import { useTranslation } from "../lib/i18n";
import styles from "./ServerConnectForm.module.css";
import { Alert, Button, Input } from "./ui";

export interface ServerConnectFormProps {
  isFirstServer?: boolean;
  initialServer?: EmbyServer | null;
  onSuccess: (server: EmbyServer) => void;
  onCancel?: () => void;
}

export function ServerConnectForm({ isFirstServer = false, initialServer, onSuccess, onCancel }: ServerConnectFormProps) {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = useState(initialServer?.serverUrl ?? "");
  const [username, setUsername] = useState(initialServer?.username ?? "");
  const [password, setPassword] = useState(initialServer?.password ?? "");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialServer) {
      setServerUrl(initialServer.serverUrl);
      setUsername(initialServer.username);
      setPassword(initialServer.password ?? "");
      setShowPassword(false);
      setError(null);
    } else {
      setServerUrl("");
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setError(null);
    }
  }, [initialServer]);

  const handleConnect = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!serverUrl || !username) {
      setError(t("serverUrlAndUsernameRequired", "Server URL and username are required"));
      return;
    }

    setIsLoading(true);
    setError(null);

    // If editing and password was not entered, check if existing session token is still valid
    if (
      initialServer &&
      !password &&
      initialServer.accessToken &&
      cleanServerUrl(serverUrl) === cleanServerUrl(initialServer.serverUrl) &&
      username.trim().toLowerCase() === initialServer.username.toLowerCase()
    ) {
      const sessionCheck = await verifyServerSession(initialServer);
      if (sessionCheck.valid) {
        setIsLoading(false);
        const serverToSave: EmbyServer = {
          ...initialServer,
          serverUrl: cleanServerUrl(serverUrl),
          username: username.trim(),
          user: sessionCheck.user || initialServer.user,
          updatedAt: Date.now(),
        };
        onSuccess(serverToSave);
        return;
      }
    }

    const result = await authenticateByName(serverUrl, username, password);

    setIsLoading(false);

    if (result.success && result.server) {
      const serverToSave: EmbyServer = initialServer
        ? {
            ...result.server,
            id: initialServer.id,
            password,
            addedAt: initialServer.addedAt ?? result.server.addedAt,
            updatedAt: Date.now(),
          }
        : {
            ...result.server,
            password,
          };
      onSuccess(serverToSave);
    } else {
      setError(result.error || t("connectionError", "Connection failed"));
    }
  };

  const formTitle = initialServer
    ? t("editServer", "Edit Emby Server")
    : isFirstServer
      ? t("connectToEmby", "Connect to Emby")
      : t("addServer", "Add Emby Server");

  const formSubtitle = initialServer
    ? t("editServerDesc", "Update server URL, username, or password credentials")
    : t("connectDesc", "Enter your Emby server URL and account credentials to connect");

  const submitLabel = isLoading
    ? initialServer
      ? t("saving", "Saving...")
      : t("connecting", "Connecting...")
    : initialServer
      ? t("saveChanges", "Save Changes")
      : t("connect", "Connect");

  return (
    <div className={styles.formPanel}>
      <form onSubmit={handleConnect}>
        <div className={styles.formContent}>
          <div className={styles.formHeader}>
            <div className={styles.headerIconBadge}>
              {initialServer ? <IconEditCircle size={20} stroke={1.8} /> : <IconServer size={20} stroke={1.8} />}
            </div>
            <div className={styles.headerTextGroup}>
              <h3 className={styles.formTitle}>{formTitle}</h3>
              <p className={styles.formSubtitle}>{formSubtitle}</p>
            </div>
          </div>

          {error && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title={t("connectionError", "Connection Error")}
              styles={{
                root: {
                  backgroundColor: "var(--danger-bg)",
                  borderColor: "var(--danger-border)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-m)",
                },
                message: { fontSize: "var(--font-size-sub)", marginTop: "0.25rem" },
                title: { fontSize: "var(--font-size-sub)", fontWeight: 600 },
              }}
            >
              {error}
            </Alert>
          )}

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="serverUrl">
                {t("serverAddress", "Server Address")}
                <span className={styles.fieldRequired}>*</span>
              </label>
            </div>
            <Input
              id="serverUrl"
              type="url"
              placeholder="http://192.168.1.100:8096"
              required
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              disabled={isLoading}
              wrapperClassName={styles.formInputWrapper}
              className={styles.formInput}
              leftSection={<IconWorld size={16} stroke={1.7} className={styles.inputIcon} />}
            />
            <span className={styles.fieldHint}>
              {t("serverAddressHelp", "Supports LAN IP, domain, or reverse proxy (e.g. http://192.168.1.100:8096)")}
            </span>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="serverUsername">
                {t("username", "Username")}
                <span className={styles.fieldRequired}>*</span>
              </label>
            </div>
            <Input
              id="serverUsername"
              type="text"
              placeholder={t("username", "Username")}
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isLoading}
              wrapperClassName={styles.formInputWrapper}
              className={styles.formInput}
              leftSection={<IconUser size={16} stroke={1.7} className={styles.inputIcon} />}
            />
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label className={styles.fieldLabel} htmlFor="serverPassword">
                {t("password", "Password")}
              </label>
            </div>
            <Input
              id="serverPassword"
              type={showPassword ? "text" : "password"}
              placeholder={t("password", "Password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete={initialServer ? "current-password" : "new-password"}
              wrapperClassName={styles.formInputWrapper}
              className={styles.formInput}
              leftSection={<IconLock size={16} stroke={1.7} className={styles.inputIcon} />}
              rightSection={
                <button
                  type="button"
                  className={styles.passwordToggleBtn}
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? t("hidePassword", "Hide Password") : t("showPassword", "Show Password")}
                  title={showPassword ? t("hidePassword", "Hide Password") : t("showPassword", "Show Password")}
                  tabIndex={-1}
                >
                  {showPassword ? <IconEyeOff size={16} stroke={1.8} /> : <IconEye size={16} stroke={1.8} />}
                </button>
              }
            />
            {initialServer?.password && (
              <span className={styles.fieldHint}>{t("passwordKeepHelp", "Leave blank to keep your currently saved password")}</span>
            )}
          </div>

          <div className={styles.formActions}>
            {onCancel && (
              <Button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isLoading}>
                {t("cancel", "Cancel")}
              </Button>
            )}
            <Button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading && <IconLoader2 size={15} className={styles.spinner} />}
              <span>{submitLabel}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
