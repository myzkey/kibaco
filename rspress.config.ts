import { defineConfig } from "@rspress/core";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  root: "docs",
  base: isGitHubPages ? "/kiban/" : "/",
  title: "Kibaco",
  description: "Start local app commands, Docker services, and localhost URLs with one command.",
  logoText: "Kibaco",
  themeConfig: {
    socialLinks: [{ icon: "github", mode: "link", content: "https://github.com/myzkey/kiban" }],
    footer: {
      message: "Released under the MIT License."
    }
  }
});
