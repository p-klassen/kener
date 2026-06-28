import { ScalarApiReference } from "@scalar/sveltekit";
import type { RequestHandler } from "./$types";
import { asset } from "$app/paths";

const render = ScalarApiReference({
  url: asset("/manage/api-spec/spec.json"),
  hideModels: true,
  hideTestRequestButton: false,
  theme: "kepler",
  darkMode: true,
  layout: "modern",
  persistAuth: true,
  hideClientButton: true,
  proxyUrl: "https://proxy.scalar.com",
  customCss: `
    section.introduction-section {
      background-image: url("/favicon.png");
      background-repeat: no-repeat;
      background-position: left 0px top 20px;
      background-size: 48px 48px;
    }
  `,
  metaData: {
    title: "Kener API Reference",
    description: "Kener free open source status page API Reference",
    ogDescription: "Kener free open source status page API Reference",
    ogTitle: "Kener API Reference",
    ogImage: "/og.png",
    twitterCard: "summary_large_image",
    twitterTitle: "Kener API Reference",
    twitterDescription: "Kener free open source status page API Reference",
    twitterImage: "/og.png",
  },
  favicon: "/favicon.png",
});

export const GET: RequestHandler = () => {
  return render();
};
