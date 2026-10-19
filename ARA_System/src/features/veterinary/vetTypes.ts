import type { SiteHeaderView } from "../../components/SiteHeader";

export type VeterinaryView =
  | SiteHeaderView
  | "veterinary-dashboard"
  | "veterinary-record"
  | "veterinary-records"
  | "vet-appointments"
  | "vet-booking"
  | "vet-appointment-details";

export type { CareScene } from "../../navigation/araNavigation";
