import React from "react";
import { createRoot } from "react-dom/client";
import "../styles/base.css";
import "../styles/components.css";
import App from "./App.jsx";

const rootElement = document.getElementById("root");

createRoot(rootElement).render(<App />);

