import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      // JSX supported
      title: (
        <img
          alt="Baresync logo"
          className="h-6"
          height={24}
          src="/baresync-logo-full-web.svg"
          width={114}
        />
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    themeSwitch: { enabled: false },
    searchToggle: {
      full: { className: "rounded-lg" },
    },
  };
}
