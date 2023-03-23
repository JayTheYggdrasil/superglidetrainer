import preprocess from "svelte-preprocess";
import adapter from "@sveltejs/adapter-static";

const dev = process.argv.includes("dev");

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),
    paths: { relative: true }
  },

  preprocess: [
    preprocess({
      scss: {
      },
    }),
  ],
};

export default config;
