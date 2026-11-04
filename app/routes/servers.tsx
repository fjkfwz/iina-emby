import { useNavigate } from "react-router";
import { ServerManagement } from "../components/ServerManagement";

export function meta() {
  return [{ title: "Servers - IINA Emby" }, { name: "description", content: "Select or add an Emby server" }];
}

export default function ServersRoute() {
  const navigate = useNavigate();

  return (
    <ServerManagement
      onServerSelected={() => {
        if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate("/");
        }
      }}
    />
  );
}
