import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // Domyślne wykluczenia vitest nie obejmują katalogów worktree (ani
    // .worktrees/, ani .claude/worktrees/ używanego przez natywne narzędzie
    // worktree) -- bez tego stare, nieusunięte worktree na dysku dublują
    // uruchamiane testy.
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/worktrees/**"],
  },
});
