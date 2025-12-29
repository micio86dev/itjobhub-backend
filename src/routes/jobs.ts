import { Elysia, t } from "elysia";
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  importJob,
  batchImportJobs
} from "../services/jobs/job.service";
import { formatResponse, formatError } from "../utils/response";

export const jobRoutes = new Elysia({ prefix: "/jobs" })
  /**
   * Create a new job
   * @method POST
   * @path /jobs
   */
  .derive(async ({ user }) => ({ user }))
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        // Only companies or admins can create jobs
        if (user.role !== "COMPANY" && user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only companies can create jobs", 403);
        }

        const job = await createJob({
          ...body,
          company_id: body.company_id,
          salary_min: body.salary_min,
          salary_max: body.salary_max
        } as any);

        set.status = 201;
        return formatResponse(job, "Job created successfully", 201);
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to create job", 500);
      }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1 }),
        description: t.String({ minLength: 1 }),
        company_id: t.String(),
        location: t.Optional(t.String()),
        salary_min: t.Optional(t.Number()),
        salary_max: t.Optional(t.Number()),
        seniority: t.Optional(t.String()),
        skills: t.Optional(t.Array(t.String())),
        remote: t.Optional(t.Boolean())
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            title: t.String(),
            description: t.Union([t.String(), t.Null(), t.Undefined()]),
            company_id: t.String(),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Number()),
            salary_max: t.Optional(t.Number()),
            seniority: t.Optional(t.String()),
            skills: t.Array(t.String()),
            remote: t.Boolean(),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.String(),
            updated_at: t.String(),
            company: t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.String()),
              logo: t.Optional(t.String()),
              website: t.Optional(t.String()),
              created_at: t.String(),
              updated_at: t.String()
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Get all jobs with pagination and filters
   * @method GET
   * @path /jobs
   */
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page || "1");
        const limit = parseInt(query.limit || "10");

        const filters: any = {};
        if (query.q) filters.q = query.q;
        if (query.company_id) filters.company_id = query.company_id;
        if (query.location) filters.location = query.location;
        if (query.seniority) filters.seniority = query.seniority;
        if (query.remote !== undefined) filters.remote = query.remote === "true";
        if (query.skills) {
          filters.skills = Array.isArray(query.skills)
            ? query.skills
            : query.skills.split(",");
        }

        const result = await getJobs(limit, filters);

        return formatResponse(result, "Jobs retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve jobs", 500);
      }
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        company_id: t.Optional(t.String()),
        location: t.Optional(t.String()),
        seniority: t.Optional(t.String()),
        remote: t.Optional(t.String()),
        skills: t.Optional(t.Union([t.String(), t.Array(t.String())]))
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            jobs: t.Array(t.Object({
              id: t.String(),
              title: t.String(),
              description: t.Any(),
              company_id: t.String(),
              location: t.Any(),
              salary_min: t.Any(),
              salary_max: t.Any(),
              seniority: t.Any(),
              skills: t.Any(),
              technical_skills: t.Any(),
              remote: t.Any(),
              status: t.Any(),
              created_at: t.Any(),
              updated_at: t.Any(),
              link: t.Any(),
              source: t.Any(),
              language: t.Any(),
              company: t.Object({
                id: t.String(),
                name: t.String(),
                logo: t.Any()
              })
            })),
            pagination: t.Object({
              page: t.Number(),
              limit: t.Number(),
              total: t.Number(),
              pages: t.Number()
            })
          })
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Get job by ID
   * @method GET
   * @path /jobs/:id
   */
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const job = await getJobById(params.id);

        if (!job) {
          set.status = 404;
          return formatError("Job not found", 404);
        }

        return formatResponse(job, "Job retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve job", 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            title: t.String(),
            description: t.Union([t.String(), t.Null(), t.Undefined()]),
            company_id: t.String(),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Number()),
            salary_max: t.Optional(t.Number()),
            seniority: t.Optional(t.String()),
            skills: t.Array(t.String()),
            remote: t.Boolean(),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.String(),
            updated_at: t.String(),
            company: t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.String()),
              logo: t.Optional(t.String()),
              website: t.Optional(t.String()),
              created_at: t.String(),
              updated_at: t.String()
            })
          })
        }),
        404: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Update job
   * @method PUT
   * @path /jobs/:id
   */
  .put(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        // Check if user is authorized to update this job
        const job = await getJobById(params.id);
        if (!job) {
          set.status = 404;
          return formatError("Job not found", 404);
        }

        // Only the company that posted the job or admins can update/delete it
        if (user.role !== "ADMIN" && job.company_id !== user.id) {
          set.status = 403;
          return formatError("Forbidden: Not authorized for this action", 403);
        }

        const updatedJob = await updateJob(params.id, {
          ...body,
          salary_min: body.salary_min,
          salary_max: body.salary_max
        } as any);

        return formatResponse(updatedJob, "Job updated successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to update job", 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String({ minLength: 1 })),
        location: t.Optional(t.String()),
        salary_min: t.Optional(t.Number()),
        salary_max: t.Optional(t.Number()),
        seniority: t.Optional(t.String()),
        skills: t.Optional(t.Array(t.String())),
        remote: t.Optional(t.Boolean()),
        status: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            title: t.String(),
            description: t.Union([t.String(), t.Null(), t.Undefined()]),
            company_id: t.String(),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Number()),
            salary_max: t.Optional(t.Number()),
            seniority: t.Optional(t.String()),
            skills: t.Array(t.String()),
            remote: t.Boolean(),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.String(),
            updated_at: t.String(),
            company: t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.String()),
              logo: t.Optional(t.String()),
              website: t.Optional(t.String()),
              created_at: t.String(),
              updated_at: t.String()
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        404: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Delete job
   * @method DELETE
   * @path /jobs/:id
   */
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        // Check if job exists
        const job = await getJobById(params.id);
        if (!job) {
          set.status = 404;
          return formatError("Job not found", 404);
        }

        // Only the company that posted the job or admins can delete it
        if (user.role !== "ADMIN" && job.company_id !== user.id) {
          set.status = 403;
          return formatError("Forbidden: Not authorized to delete this job", 403);
        }

        await deleteJob(params.id);

        return formatResponse(null, "Job deleted successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to delete job", 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        404: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Import a single job with company relation
   * @method POST
   * @path /jobs/import
   */
  .post(
    "/import",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        // Only admins can import jobs
        if (user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only admins can import jobs", 403);
        }

        const job = await importJob(body);

        set.status = 201;
        return formatResponse(job, "Job imported successfully", 201);
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to import job", 500);
      }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1 }),
        description: t.String({ minLength: 1 }),
        company: t.Object({
          name: t.String({ minLength: 1 }),
          description: t.Optional(t.String()),
          website: t.Optional(t.String()),
          logo_url: t.Optional(t.String())
        }),
        location: t.Optional(t.String()),
        salary_min: t.Optional(t.Number()),
        salary_max: t.Optional(t.Number()),
        seniority: t.Optional(t.String()),
        skills: t.Optional(t.Array(t.String())),
        technical_skills: t.Optional(t.Array(t.String())),
        remote: t.Optional(t.Boolean()),
        link: t.Optional(t.String()),
        source: t.Optional(t.String()),
        language: t.Optional(t.String())
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            title: t.String(),
            description: t.Union([t.String(), t.Null(), t.Undefined()]),
            company_id: t.String(),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Number()),
            salary_max: t.Optional(t.Number()),
            seniority: t.Optional(t.String()),
            skills: t.Array(t.String()),
            remote: t.Boolean(),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.String(),
            updated_at: t.String(),
            company: t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.String()),
              logo: t.Optional(t.String()),
              website: t.Optional(t.String()),
              created_at: t.String(),
              updated_at: t.String()
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  )
  /**
   * Batch import jobs with company relations
   * @method POST
   * @path /jobs/import/batch
   */
  .post(
    "/import/batch",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }

        // Only admins can import jobs
        if (user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only admins can import jobs", 403);
        }

        const results = await batchImportJobs(body.jobs);

        set.status = 201;
        return formatResponse(results, "Batch import completed", 201);
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to import jobs", 500);
      }
    },
    {
      body: t.Object({
        jobs: t.Array(t.Object({
          title: t.String({ minLength: 1 }),
          description: t.String({ minLength: 1 }),
          company: t.Object({
            name: t.String({ minLength: 1 }),
            description: t.Optional(t.String()),
            website: t.Optional(t.String()),
            logo: t.Optional(t.String())
          }),
          location: t.Optional(t.String()),
          salaryMin: t.Optional(t.Number()),
          salaryMax: t.Optional(t.Number()),
          seniority: t.Optional(t.String()),
          skills: t.Optional(t.Array(t.String())),
          remote: t.Optional(t.Boolean())
        }))
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            successful: t.Array(t.Object({
              job: t.Any(),
              companyName: t.String()
            })),
            failed: t.Array(t.Object({
              jobData: t.Any(),
              error: t.String()
            })),
            summary: t.Object({
              totalJobs: t.Number(),
              successfulJobs: t.Number(),
              failedJobs: t.Number(),
              companiesCreated: t.Number()
            })
          })
        }),
        401: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        403: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        }),
        500: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String()
        })
      },
      detail: {
        tags: ["jobs"]
      }
    }
  );