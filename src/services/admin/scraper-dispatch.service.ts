import { config } from "../../config";
import logger from "../../utils/logger";

/**
 * Manual scraper trigger via the GitHub Actions REST API.
 *
 * The scrapers run as a Python workflow on the VPS, dispatched by the
 * `scrapers-ci-cd.yml` workflow. The dashboard "Run import" button hits the
 * backend, which dispatches that workflow with `{ scraper, environment }`
 * inputs. The environment is derived from the backend's OWN NODE_ENV, so the
 * staging dashboard always targets staging and prod always targets prod — the
 * caller cannot cross environments.
 */

export type ScraperKind = "job" | "news" | "both";
export type DeployEnvironment = "production" | "staging";

const GITHUB_API = "https://api.github.com";

interface GitHubRunSummary {
  status: string | null; // queued | in_progress | completed
  conclusion: string | null; // success | failure | cancelled | null while running
  html_url: string;
  created_at: string;
  run_started_at: string | null;
  event: string;
}

interface RawWorkflowRun {
  status?: string | null;
  conclusion?: string | null;
  html_url?: string;
  created_at?: string;
  run_started_at?: string | null;
  event?: string;
}

/** The environment this backend instance serves (production vs everything else). */
export const currentEnvironment = (): DeployEnvironment =>
  config.nodeEnv === "production" ? "production" : "staging";

/** Branch the workflow is dispatched from — must carry the workflow file. */
const refForEnvironment = (env: DeployEnvironment): string =>
  env === "production" ? "main" : "develop";

const githubHeaders = (): HeadersInit => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${config.scraperDispatch.token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "devboards-backend"
});

export class ScraperDispatchError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = "ScraperDispatchError";
  }
}

const assertConfigured = (): void => {
  if (!config.scraperDispatch.token) {
    throw new ScraperDispatchError(
      "Scraper dispatch is not configured (missing GH_DISPATCH_TOKEN)",
      503
    );
  }
};

/**
 * Dispatch the scrapers workflow. Resolves to the targeted environment so the
 * caller can echo it back. Throws ScraperDispatchError on a non-204 response.
 */
export const dispatchImport = async (
  scraper: ScraperKind
): Promise<{ scraper: ScraperKind; environment: DeployEnvironment }> => {
  assertConfigured();

  const environment = currentEnvironment();
  const ref = refForEnvironment(environment);
  const { repo, workflow } = config.scraperDispatch;
  const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${workflow}/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: githubHeaders(),
    body: JSON.stringify({ ref, inputs: { scraper, environment } })
  });

  if (res.status !== 204) {
    const detail = await res.text().catch(() => "");
    logger.error(
      { status: res.status, detail, scraper, environment },
      "[ScraperDispatch] workflow dispatch failed"
    );
    throw new ScraperDispatchError(
      `GitHub workflow dispatch failed (${res.status})`,
      res.status === 401 || res.status === 403 ? 502 : 502
    );
  }

  logger.info({ scraper, environment, ref }, "[ScraperDispatch] workflow dispatched");
  return { scraper, environment };
};

/**
 * Latest run of the scrapers workflow (status badge + link). Returns null when
 * there is no run yet. Throws ScraperDispatchError on API failure.
 */
export const getLatestRun = async (): Promise<GitHubRunSummary | null> => {
  assertConfigured();

  const { repo, workflow } = config.scraperDispatch;
  const url = `${GITHUB_API}/repos/${repo}/actions/workflows/${workflow}/runs?per_page=1`;

  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.error({ status: res.status, detail }, "[ScraperDispatch] run lookup failed");
    throw new ScraperDispatchError(`GitHub run lookup failed (${res.status})`, 502);
  }

  const data = (await res.json()) as { workflow_runs?: RawWorkflowRun[] };
  const run = data.workflow_runs?.[0];
  if (!run) return null;

  return {
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    html_url: run.html_url ?? "",
    created_at: run.created_at ?? "",
    run_started_at: run.run_started_at ?? null,
    event: run.event ?? ""
  };
};
