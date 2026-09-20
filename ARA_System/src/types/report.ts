// Shape of GET /api/reports/analytics. Mirrors the breakdown the backend
// assembles in server/src/modules/reports/reports.service.ts.
export type ReportRange = "30d" | "90d" | "12m" | "all";

export type ReportPoint = { label: string; value: number };

export type PerAnimalApplications = {
  animalId: string;
  name: string;
  publicId: string;
  applications: number;
};

export type AnalyticsReport = {
  range: ReportRange;
  generatedAt: string;
  animals: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    vaccinated: number;
    notVaccinated: number;
    medicallyCleared: number;
    trend: ReportPoint[];
  };
  rescue: {
    total: number;
    byStatus: Record<string, number>;
    byUrgency: Record<string, number>;
    bySource: Record<string, number>;
    trend: ReportPoint[];
  };
  adoptions: {
    total: number;
    byStatus: Record<string, number>;
    trend: ReportPoint[];
    perAnimal: PerAnimalApplications[];
  };
  donations: {
    total: number;
    totalCents: number;
    byMethod: Record<string, number>;
    trend: ReportPoint[];
  };
};