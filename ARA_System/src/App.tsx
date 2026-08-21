import { useAuth } from "@clerk/react";
import { useState } from "react";
import "./App.css";
import { AuthPage } from "./components/AuthPage";
import { HomePage } from "./components/HomePage";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { UserDashboard } from "./components/UserDashboard";

export type View =
  | "home"
  | "login"
  | "register"
  | "dashboard"
  | "user-dashboard";

function App() {
  const [view, setView] = useState<View>("home");
  const { isLoaded, isSignedIn } = useAuth();

  if (view === "dashboard") {
    return <ManagerDashboard onNavigate={setView} />;
  }

  if (view === "user-dashboard") {
    return <UserDashboard onNavigate={setView} />;
  }

  if (view === "login" || view === "register") {
    return <AuthPage mode={view} onNavigate={setView} />;
  }

  return (
    <HomePage
      isLoaded={isLoaded}
      isSignedIn={isSignedIn}
      onNavigate={setView}
    />
  );
}

export default App;
