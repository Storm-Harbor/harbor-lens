import { createRoot } from "react-dom/client";
import SandboxEntry from "./SandboxEntry";
import "./styles.css";

export const application = createRoot(document.getElementById("app"));
application.render(<SandboxEntry />);
