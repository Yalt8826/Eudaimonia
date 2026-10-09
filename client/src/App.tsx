import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes/routes";

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

// deliberate T0.6 red-proof: accent hex outside theme.css #2DD4BF
