import { SignInButton, useAuth, useUser } from "@clerk/react";
import { useEffect, useState, type ReactNode } from "react";
import spcaLogo from "../assets/spca-logo.png";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SiteHeader, type SiteHeaderView } from "./SiteHeader";
import { SkeletonLoader } from "./SkeletonLoader";
import type {
  AnalyticsReport,
  ReportPoint,
  ReportRange,
} from "../types/report";

type ReportsPageProps = { onNavigate: (view: SiteHeaderView) => void };

const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

const RANGE_OPTIONS: { value: ReportRange; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

// Palette kept close to the design tokens so the charts look native even
// though recharts needs concrete hex values.
const CHART_COLORS = [
  "#1386b3",
  "#1f9d55",
  "#e5a500",
  "#d94f4f",
  "#7c7cc9",
  "#2bb3a3",
  "#b06db8",
  "#637381",
];

const ANIMAL_TYPE_LABELS: Record<string, string> = {
  dog: "Dogs",
  cat: "Cats",
  rabbit: "Rabbits",
  other: "Other",
};

const RESCUE_SOURCE_LABELS: Record<string, string> = {
  online: "Online",
  phone: "Phone",
};

const DONATION_METHOD_LABELS: Record<string, string> = {
  card: "Card",
  qr: "QR",
};

function prettyLabel(key: string): string {
  if (!key) return "Unknown";
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (first) => first.toUpperCase());
}

function recordToSeries(
  record: Record<string, number>,
): { name: string; count: number }[] {
  return Object.entries(record)
    .map(([key, count]) => ({ name: prettyLabel(key), count }))
    .sort((a, b) => b.count - a.count);
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      "The SPCA API is not running. Start it with `npm run server:dev`.",
    );
  }
  return (await response.json()) as T;
}

export function ReportsPage({ onNavigate }: ReportsPageProps) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [range, setRange] = useState<ReportRange>("90d");
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const userRole = user?.publicMetadata.role;
  const hasManagerAccess = userRole === "manager" || userRole === "admin";

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hasManagerAccess) return;

    void (async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const token = await getToken();
        if (!token) throw new Error("Your Clerk session has expired.");
        const response = await fetch(
          `${apiBaseUrl}/api/reports/analytics?range=${range}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const result = await readApiResponse<
          AnalyticsReport & { error?: string }
        >(response);
        if (!response.ok)
          throw new Error(result.error ?? "Report data could not be loaded.");
        setReport(result);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Report data could not be loaded.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [getToken, hasManagerAccess, isLoaded, isSignedIn, range]);

  if (!isLoaded || !isSignedIn) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Sign in to continue</h1>
          <p>Only authenticated users can access the SPCA reports.</p>
          <SignInButton mode="modal">
            <button type="button" className="teal-button">
              Log in
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  if (!hasManagerAccess) {
    return (
      <main className="dashboard-locked">
        <div className="dashboard-locked-card">
          <div className="auth-brand">
            <img src={spcaLogo} alt="SPCA Fiji logo" className="brand-logo" />
            <strong>SPCA Fiji</strong>
          </div>
          <p className="eyebrow">Manager workspace</p>
          <h1>Access restricted</h1>
          <p>Your account does not have Manager or Admin permissions.</p>
          <button
            type="button"
            className="teal-button"
            onClick={() => onNavigate("home")}
          >
            Return home
          </button>
        </div>
      </main>
    );
  }

  const animals = report?.animals;
  const rescue = report?.rescue;
  const adoptions = report?.adoptions;
  const donations = report?.donations;

  return (
    <main className="dashboard-page report-page">
      <SiteHeader
        isLoaded={isLoaded}
        isSignedIn={isSignedIn}
        currentPage="reports"
        onNavigate={onNavigate}
      />

      {/* Shown on screen only; the print stylesheet swaps this for the
          report-branded header below. */}
      <section className="dashboard-welcome report-toolbar no-print">
        <div>
          <span className="role-pill teal-pill">Manager / Admin</span>
          <p className="eyebrow">Reports</p>
          <h2>Animals, rescues, adoptions &amp; donations at a glance.</h2>
          <p>
            Every figure is pulled live from the SPCA database for the selected
            period.
          </p>
        </div>
        <div className="report-toolbar-actions">
          <label className="report-range">
            Period
            <select
              value={range}
              onChange={(event) => setRange(event.target.value as ReportRange)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="teal-button"
            onClick={() => window.print()}
          >
            Download PDF
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => onNavigate("dashboard")}
          >
            Back to dashboard
          </button>
        </div>
      </section>

      {/* Branded header only visible when the report is printed/saved to PDF. */}
      <section className="report-print-header">
        <p className="eyebrow">SPCA Fiji — Animal Rescue &amp; Adoption report</p>
        <h1>Rescue &amp; adoption activity report</h1>
        <p>
          Period:{" "}
          {RANGE_OPTIONS.find((option) => option.value === range)?.label ??
            range}
          {report ? ` · Generated ${formatGeneratedAt(report.generatedAt)}` : ""}
        </p>
      </section>

      <section className="dashboard-metrics" aria-label="Report summary">
        <article>
          <span>Animals registered</span>
          <strong>
            {animals ? (
              animals.total
            ) : (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            )}
          </strong>
          <small>All-time snapshot</small>
        </article>
        <article>
          <span>Rescue reports</span>
          <strong>
            {rescue ? (
              rescue.total
            ) : (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            )}
          </strong>
          <small>In this period</small>
        </article>
        <article>
          <span>Adoption applications</span>
          <strong>
            {adoptions ? (
              adoptions.total
            ) : (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            )}
          </strong>
          <small>In this period</small>
        </article>
        <article>
          <span>Donations raised</span>
          <strong>
            {donations ? (
              formatMoney(donations.totalCents)
            ) : (
              <span className="skeleton-bar skeleton-metric-value" aria-hidden="true" />
            )}
          </strong>
          <small>Completed, in this period</small>
        </article>
      </section>

      {isLoading && (
        <SkeletonLoader variant="card" />
      )}
      {!isLoading && loadError && (
        <p className="dashboard-data-state error">{loadError}</p>
      )}

      {!isLoading && !loadError && report && (
        <section className="dashboard-grid report-grid">
          <AnimalPanel animals={animals!} />
          <RescuePanel rescue={rescue!} />
          <AdoptionPanel adoptions={adoptions!} />
          <DonationPanel donations={donations!} />
        </section>
      )}
    </main>
  );
}

function PanelShell({
  eyebrow,
  title,
  note,
  children,
}: {
  eyebrow: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="dashboard-panel report-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {note && <span className="panel-note">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function TrendChart({ points }: { points: ReportPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="dashboard-data-state">No activity recorded in this period.</p>
    );
  }
  const data = points.map((point) => ({
    name: point.label,
    count: point.value,
  }));
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--slate)" />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            stroke="var(--slate)"
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#1386b3"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownChart({
  record,
  labels,
  valueLabel = "count",
}: {
  record: Record<string, number>;
  labels?: Record<string, string>;
  valueLabel?: string;
}) {
  const data = recordToSeries(record);
  if (data.length === 0) {
    return (
      <p className="dashboard-data-state">No data recorded in this period.</p>
    );
  }
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
          <XAxis
            dataKey={(entry) =>
              labels?.[String(entry.name).toLowerCase()] ?? entry.name
            }
            tick={{ fontSize: 12 }}
            stroke="var(--slate)"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            stroke="var(--slate)"
          />
          <Tooltip />
          <Bar dataKey="count" name={valueLabel} radius={[6, 6, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ShareChart({
  record,
  labels,
}: {
  record: Record<string, number>;
  labels?: Record<string, string>;
}) {
  const data = recordToSeries(record).map((entry) => ({
    ...entry,
    label: labels?.[String(entry.name).toLowerCase()] ?? entry.name,
  }));
  if (data.length === 0) {
    return (
      <p className="dashboard-data-state">No data recorded in this period.</p>
    );
  }
  return (
    <div className="chart-box chart-box-share">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius="45%"
            outerRadius="70%"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.label}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnimalPanel({ animals }: { animals: AnalyticsReport["animals"] }) {
  return (
    <PanelShell
      eyebrow="Profiles"
      title="Animal registrations"
      note={`${animals.total} total`}
    >
      <div className="report-kpi-row">
        <span>
          Vaccinated: <strong>{animals.vaccinated}</strong>
        </span>
        <span>
          Not vaccinated: <strong>{animals.notVaccinated}</strong>
        </span>
        <span>
          Medically cleared: <strong>{animals.medicallyCleared}</strong>
        </span>
      </div>
      {animals.trend.length > 0 && (
        <div>
          <p className="report-chart-title">Registrations per month</p>
          <TrendChart points={animals.trend} />
        </div>
      )}
      {Object.keys(animals.byType).length > 0 && (
        <div>
          <p className="report-chart-title">Registered by type</p>
          <BreakdownChart record={animals.byType} labels={ANIMAL_TYPE_LABELS} />
        </div>
      )}
    </PanelShell>
  );
}

function RescuePanel({ rescue }: { rescue: AnalyticsReport["rescue"] }) {
  return (
    <PanelShell
      eyebrow="Rescue"
      title="Rescue reports"
      note={`${rescue.total} in period`}
    >
      {rescue.trend.length > 0 && (
        <div>
          <p className="report-chart-title">Reports per month</p>
          <TrendChart points={rescue.trend} />
        </div>
      )}
      {Object.keys(rescue.byUrgency).length > 0 && (
        <div>
          <p className="report-chart-title">By urgency</p>
          <BreakdownChart record={rescue.byUrgency} />
        </div>
      )}
      {Object.keys(rescue.bySource).length > 0 && (
        <div>
          <p className="report-chart-title">Online vs phone</p>
          <ShareChart record={rescue.bySource} labels={RESCUE_SOURCE_LABELS} />
        </div>
      )}
    </PanelShell>
  );
}

function AdoptionPanel({
  adoptions,
}: {
  adoptions: AnalyticsReport["adoptions"];
}) {
  return (
    <PanelShell
      eyebrow="Adoptions"
      title="Adoption applications"
      note={`${adoptions.total} in period`}
    >
      {adoptions.trend.length > 0 && (
        <div>
          <p className="report-chart-title">Applications per month</p>
          <TrendChart points={adoptions.trend} />
        </div>
      )}
      {Object.keys(adoptions.byStatus).length > 0 && (
        <div>
          <p className="report-chart-title">By review status</p>
          <BreakdownChart record={adoptions.byStatus} />
        </div>
      )}
      {adoptions.perAnimal.length > 0 && (
        <div className="report-per-animal">
          <p className="report-chart-title">Most applied-for animals</p>
          <table>
            <thead>
              <tr>
                <th>Animal</th>
                <th>Reference</th>
                <th>Applications</th>
              </tr>
            </thead>
            <tbody>
              {adoptions.perAnimal.map((entry) => (
                <tr key={entry.animalId}>
                  <td>{entry.name}</td>
                  <td>{entry.publicId}</td>
                  <td>{entry.applications}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelShell>
  );
}

function DonationPanel({
  donations,
}: {
  donations: AnalyticsReport["donations"];
}) {
  return (
    <PanelShell
      eyebrow="Donations"
      title="Donations"
      note={`${formatMoney(donations.totalCents)} in period`}
    >
      <div className="report-kpi-row">
        <span>
          Completed: <strong>{donations.total}</strong>
        </span>
        <span>
          Total raised: <strong>{formatMoney(donations.totalCents)}</strong>
        </span>
      </div>
      {donations.trend.length > 0 && (
        <div>
          <p className="report-chart-title">Income per month</p>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={donations.trend.map((point) => ({
                  name: point.label,
                  amount: point.value / 100,
                }))}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--slate)" />
                <YAxis tick={{ fontSize: 12 }} stroke="var(--slate)" />
                <Tooltip
                  formatter={(value) => [
                    `$${Number(value).toLocaleString()}`,
                    "Raised",
                  ]}
                />
                <Bar
                  dataKey="amount"
                  name="Raised"
                  fill="#1386b3"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {Object.keys(donations.byMethod).length > 0 && (
        <div>
          <p className="report-chart-title">By payment method</p>
          <ShareChart record={donations.byMethod} labels={DONATION_METHOD_LABELS} />
        </div>
      )}
    </PanelShell>
  );
}