import "./index.css";
import { APITester } from "./APITester";
import { Card, CardContent } from "@/components/ui/card";

import logo from "./logo.svg";
import reactLogo from "./react.svg";

export function App() {
  return (
    <div className="container mx-auto p-8 text-center relative z-10 w-screen">
      <APITester />
    </div>
  );
}

export default App;
