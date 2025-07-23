import "./index.css";
import { APITester } from "./APITester";
import { Card, CardContent } from "@/components/ui/card";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

export function App() {
  return (
    <div className="text-center relative z-10 w-screen h-screen">
      <APITester />
    </div>
  );
}

export default App;
