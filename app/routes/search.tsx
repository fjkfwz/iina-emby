import { Navigate, useSearchParams } from "react-router";

export function meta() {
  return [{ title: "Search - IINA Emby" }, { name: "description", content: "Search library" }];
}

export default function SearchRoute() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  return <Navigate to={q ? `/?q=${encodeURIComponent(q)}` : "/?focus=search"} replace />;
}
