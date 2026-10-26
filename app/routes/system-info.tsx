import { useNavigate } from "react-router";
import { PageHeader } from "~/components/PageHeader";
import { SystemInfo } from "~/components/SystemInfo";
import { useTranslation } from "~/lib/i18n";
import styles from "./system-info.module.css";

export function meta() {
  return [{ title: "System Info - IINA Emby" }];
}

export default function SystemInfoRoute() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const onBack = () => {
    navigate("/");
  };

  return (
    <>
      <PageHeader onBack={onBack} backTitle={t("back", "Back")} className={styles.pageHeader} title={t("systemInfoTitle", "System Information")} />

      <div className={styles.container}>
        <SystemInfo />
      </div>
    </>
  );
}
