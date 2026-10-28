import { useQuery } from "@tanstack/react-query";
import { listLibrary } from "./library.functions";
import { CATEGORIES } from "./formulas";
export function useLibrary() {
  const query = useQuery({ queryKey: ["formula-library"], queryFn: () => listLibrary() });
  return {
    ...query,
    categories: [...CATEGORIES, ...(query.data?.categories ?? [])],
    posts: query.data?.posts ?? [],
  };
}
