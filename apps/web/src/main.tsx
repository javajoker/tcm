import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { createAppStore, StoreProvider } from "./app/store.tsx";
import { browserEnvironment, createPersistence } from "./storage/persistence.ts";
import "./styles/tokens.css";
import "./styles/base.css";

const root = document.getElementById("root");
if (root === null) throw new Error("#root is missing");
const store = createAppStore({ persistence: createPersistence(browserEnvironment()) });
createRoot(root).render(<StrictMode><StoreProvider store={store}><App /></StoreProvider></StrictMode>);
