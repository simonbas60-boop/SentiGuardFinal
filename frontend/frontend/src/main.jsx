import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: "#111c2e",
          color: "#e2e8f0",
          border: "1px solid #263449",
        },
      }}
    />
    <App />
  </BrowserRouter>,
);
