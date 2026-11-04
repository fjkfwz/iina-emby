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
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <>
      <PageHeader
        onBack={onBack}
        backTitle={t("back", "Back")}
        className={styles.pageHeader}
        title={t("systemInfoTitle", "System Information")}
      />

      <div className={styles.container}>
        <SystemInfo />
      </div>
    </>
  );
}
