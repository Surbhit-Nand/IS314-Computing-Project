import { useAuth } from "@clerk/react";
import { useState } from "react";
import "./App.css";
import { AboutUs } from "./components/AboutUs";
import { AnimalListings } from "./components/AnimalListings";
import { AnimalProfilePage } from "./components/AnimalProfilePage";
import { AuthPage } from "./components/AuthPage";
import { HomePage } from "./components/HomePage";
import { ManagerDashboard } from "./components/ManagerDashboard";
import { StaffDashboard } from "./components/StaffDashboard";
import { UserDashboard } from "./components/UserDashboard";
import { AnimalRegistrationForm } from "./features/animals/AnimalRegistrationForm";
import { EditAnimalProfile } from "./features/animals/EditAnimalProfile";
import { ManageAnimalProfiles } from "./features/animals/ManageAnimalProfiles";
import type { Animal } from "./types/animal";

export type View =
  | "home"
  | "animal-listings"
  | "about"
  | "animal-profile"
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
  // The animal a visitor clicked "View full profile" on. Holds the whole
  // object (not just an id) since the public listing fetch that got us here
  // already returned every field - no second request needed to render the
  // profile page.
  const [viewedAnimal, setViewedAnimal] = useState<Animal | null>(null);
  const { isLoaded, isSignedIn } = useAuth();

  function handleViewAnimal(animal: Animal) {
    setViewedAnimal(animal);
    setView("animal-profile");
  }

  if (view === "dashboard") {
    return <ManagerDashboard onNavigate={setView} />;
  }

  if (view === "staff-dashboard") {
    return <StaffDashboard onNavigate={setView} />;
  }

  if (view === "user-dashboard") {
    return <UserDashboard onNavigate={setView} />;
  }

  if (view === "animal-listings") {
    return (
      <AnimalListings
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="animal-listings"
        onNavigate={setView}
        onViewAnimal={handleViewAnimal}
      />
    );
  }

  if (view === "about") {
    return (
      <AboutUs
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="about"
        onNavigate={setView}
      />
    );
  }

  if (view === "animal-profile" && viewedAnimal) {
    return (
      <AnimalProfilePage
        animal={viewedAnimal}
        onBack={() => setView("animal-listings")}
      />
    );
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
      currentPage="home"
      onNavigate={setView}
      onViewAnimal={handleViewAnimal}
    />
  );
}

export default App;
