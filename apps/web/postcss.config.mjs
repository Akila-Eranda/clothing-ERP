/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {
      content: [
        "./src/**/*.{ts,tsx}",
        "./node_modules/react-table-craft/dist/**/*.{js,mjs}",
      ],
    },
    autoprefixer: {},
  },
};

export default config;
