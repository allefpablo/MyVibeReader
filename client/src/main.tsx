import "./utils/polyfills";
import { applyEpubPatches } from "./utils/epubPatch";
import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import App from "./App";

applyEpubPatches();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
