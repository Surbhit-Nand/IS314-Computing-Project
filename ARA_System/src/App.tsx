import { useAuth } from "@clerk/react";
import { useState } from "react";
import "./App.css";
import { AuthPage } from "./components/AuthPage";
import { HomePage } from "./components/HomePage";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { StaffDashboard } from "./components/StaffDashboard";
import { UserDashboard } from "./components/UserDashboard";
import { AnimalRegistrationForm } from "./features/animals/AnimalRegistrationForm";
import { EditAnimalProfile } from "./features/animals/EditAnimalProfile";
import { ManageAnimalProfiles } from "./features/animals/ManageAnimalProfiles";

export type View =
  | "home"
  | "login"
  | "register"
  | "dashboard"
  | "staff-dashboard"
  | "user-dashboard"
  | "register-animal"
  | "manage-animals"
  | "edit-animal";

function App() {
  const [view, setView] = useState<View>("home");
  // Tracks which animal is being edited so EditAnimalProfile knows which
  // profile to load - there is no router/URL param for this, so it rides
  // alongside `view` in local state.
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const { isLoaded, isSignedIn } = useAuth();

  if (view === "dashboard") {
    return <ManagerDashboard onNavigate={setView} />;
  }

  if (view === "staff-dashboard") {
    return <StaffDashboard onNavigate={setView} />;
  }

  if (view === "user-dashboard") {
    return <UserDashboard onNavigate={setView} />;
  }

  if (view === "register-animal") {
    return <AnimalRegistrationForm onNavigate={setView} />;
  }

  if (view === "manage-animals") {
    return (
      <ManageAnimalProfiles
        onNavigate={setView}
        onSelectAnimal={(animalId) => {
          setSelectedAnimalId(animalId);
          setView("edit-animal");
        }}
      />
    );
  }

  if (view === "edit-animal" && selectedAnimalId) {
    return <EditAnimalProfile animalId={selectedAnimalId} onNavigate={setView} />;
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
