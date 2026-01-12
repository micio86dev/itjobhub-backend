import { Elysia, t } from "elysia";
import {
  createJob,
  getJobs,
  getJobById,
  updateJob,
  deleteJob,
  importJob,
  batchImportJobs,
  getTopSkills
} from "../services/jobs/job.service";
import { formatResponse, formatError, getErrorMessage } from "../utils/response";
import { authMiddleware } from "../middleware/auth";

export const jobRoutes = new Elysia({ prefix: "/jobs" })
  /**
   * Use auth middleware to add user to context
   */
  .use(authMiddleware)
  /**
   * Create a new job
   * @method POST
   * @path /jobs
   */
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

        const companyId = user.role === "COMPANY" ? user.id : body.company_id;

        if (!companyId) {
          set.status = 400;
          return formatError("company_id is required", 400);
        }

        const job = await createJob({
          ...body,
          company_id: companyId,
          salary_min: body.salary_min,
          salary_max: body.salary_max,
          skills: body.skills ? (Array.isArray(body.skills) ? body.skills : [body.skills]) : undefined
        });

        set.status = 201;
        return formatResponse(job, "Job created successfully", 201);
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to create job: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      body: t.Object({
        title: t.String({ minLength: 1 }),
        description: t.String({ minLength: 1 }),
        company_id: t.Optional(t.String()),
        location: t.Optional(t.String()),
        salary_min: t.Optional(t.Number()),
        salary_max: t.Optional(t.Number()),
        seniority: t.Optional(t.String()),
        skills: t.Optional(t.Union([t.Array(t.String()), t.String()])),
        remote: t.Optional(t.Boolean()),
        link: t.Optional(t.String())
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
            company_id: t.Union([t.String(), t.Null()]),
            location: t.Optional(t.Union([t.String(), t.Null()])),
            salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
            salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
            seniority: t.Optional(t.Union([t.String(), t.Null()])),
            skills: t.Array(t.String()),
            technical_skills: t.Optional(t.Array(t.String())),
            employment_type: t.Optional(t.Union([t.String(), t.Null()])),
            experience_level: t.Optional(t.Union([t.String(), t.Null()])),
            remote: t.Boolean(),
            is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])),
            published_at: t.Any(),
            expires_at: t.Any(),
            created_at: t.Any(),
            updated_at: t.Any(),
            link: t.Optional(t.Union([t.String(), t.Null()])),
            source: t.Optional(t.Union([t.String(), t.Null()])),
            language: t.Optional(t.Union([t.String(), t.Null()])),
            company: t.Union([t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.Union([t.String(), t.Null()])),
              logo: t.Optional(t.Union([t.String(), t.Null()])),
              website: t.Optional(t.Union([t.String(), t.Null()])),
              trustScore: t.Optional(t.Number()),
              totalRatings: t.Optional(t.Number()),
              created_at: t.Any(),
              updated_at: t.Any()
            }), t.Null()])
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
   * Get top skills
   * @method GET
   * @path /jobs/stats/skills
   */
  .get(
    "/stats/skills",
    async ({ query, set }) => {
      try {
        const limit = query.limit || 10;
        const year = query.year;
        const skills = await getTopSkills(limit, year);
        return formatResponse(skills, "Top skills retrieved successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to retrieve top skills: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        limit: t.Optional(t.Numeric()),
        year: t.Optional(t.Numeric())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Array(t.Object({
            skill: t.String(),
            count: t.Number()
          }))
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
    async ({ query, set, user }) => {
      try {
        const page = query.page || 1;
        const limit = query.limit || 50;

        const filters: {
          q?: string;
          company_id?: string;
          location?: string;
          seniority?: string;
          remote?: boolean;
          skills?: string[];
          languages?: string[];
          lat?: number;
          lng?: number;
          radius_km?: number;
          dateRange?: string;
          looseSeniority?: boolean;
        } = {};

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
        if (query.languages) {
          filters.languages = Array.isArray(query.languages)
            ? query.languages
            : query.languages.split(",");
        }
        if (query.lat) filters.lat = query.lat;
        if (query.lng) filters.lng = query.lng;
        if (query.radius_km) filters.radius_km = query.radius_km;
        if (query.dateRange) filters.dateRange = query.dateRange;
        if (query.looseSeniority) filters.looseSeniority = query.looseSeniority === "true";

        const result = await getJobs(page, limit, filters, (user as any)?.id);

        return formatResponse(result, "Jobs retrieved successfully");
      } catch (error: unknown) {
        console.error("Error retrieving jobs:", error);
        set.status = 500;
        return formatError(`Failed to retrieve jobs: ${getErrorMessage(error)}`, 500);
      }
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
        company_id: t.Optional(t.String()),
        location: t.Optional(t.String()),
        seniority: t.Optional(t.String()),
        remote: t.Optional(t.String()),
        skills: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        languages: t.Optional(t.Union([t.String(), t.Array(t.String())])),
        lat: t.Optional(t.Numeric()),
        lng: t.Optional(t.Numeric()),
        radius_km: t.Optional(t.Numeric()),
        dateRange: t.Optional(t.String()),
        looseSeniority: t.Optional(t.String())
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
              description: t.Union([t.String(), t.Null()]),
              company_id: t.Union([t.String(), t.Null()]),
              location: t.Optional(t.Union([t.String(), t.Null()])),
              salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
              salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
              seniority: t.Optional(t.Union([t.String(), t.Null()])),
              skills: t.Optional(t.Array(t.String())),
              technical_skills: t.Optional(t.Array(t.String())),
              location_geo: t.Optional(t.Union([
                t.Object({
                  type: t.String(),
                  coordinates: t.Array(t.Number())
                }),
                t.Null()
              ])),
              employment_type: t.Optional(t.Union([t.String(), t.Null()])),
              experience_level: t.Optional(t.Union([t.String(), t.Null()])),
              remote: t.Optional(t.Union([t.Boolean(), t.Null()])),
              is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])),
              status: t.Optional(t.Union([t.String(), t.Null()])),
              published_at: t.Any(),
              expires_at: t.Any(),
              created_at: t.Any(),
              updated_at: t.Any(),
              link: t.Optional(t.Union([t.String(), t.Null()])),
              source: t.Optional(t.Union([t.String(), t.Null()])),
              language: t.Optional(t.Union([t.String(), t.Null()])),
              likes: t.Number(),
              dislikes: t.Number(),
              user_reaction: t.Union([t.String(), t.Null()]),
              is_favorite: t.Optional(t.Boolean()),
              comments_count: t.Number(),
              company: t.Union([t.Object({
                id: t.String(),
                name: t.String(),
                logo: t.Optional(t.Union([t.String(), t.Null()])),
                trustScore: t.Optional(t.Number()),
                totalRatings: t.Optional(t.Number()),
                totalLikes: t.Optional(t.Number()),
                totalDislikes: t.Optional(t.Number())
              }), t.Null()])
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
    async ({ params, set, user }) => {
      try {
        const job = await getJobById(params.id, user?.id);

        if (!job) {
          set.status = 404;
          return formatError("Job not found", 404);
        }

        return formatResponse(job, "Job retrieved successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to retrieve job: ${getErrorMessage(error)}`, 500);
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
            company_id: t.Union([t.String(), t.Null()]),
            location: t.Optional(t.Union([t.String(), t.Null()])),
            salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
            salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
            seniority: t.Optional(t.Union([t.String(), t.Null()])),
            skills: t.Array(t.String()),
            technical_skills: t.Optional(t.Array(t.String())),
            location_geo: t.Optional(t.Union([
              t.Object({
                type: t.String(),
                coordinates: t.Array(t.Number())
              }),
              t.Null()
            ])),
            employment_type: t.Optional(t.Union([t.String(), t.Null()])),
            experience_level: t.Optional(t.Union([t.String(), t.Null()])),
            remote: t.Boolean(),
            is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])),
            published_at: t.Any(),
            expires_at: t.Any(),
            link: t.Optional(t.Union([t.String(), t.Null()])),
            source: t.Optional(t.Union([t.String(), t.Null()])),
            language: t.Optional(t.Union([t.String(), t.Null()])),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            likes: t.Number(),
            dislikes: t.Number(),
            user_reaction: t.Union([t.String(), t.Null()]),
            comments_count: t.Number(),
            availability: t.String(),
            is_favorite: t.Boolean(),
            created_at: t.Any(),
            updated_at: t.Any(),
            company: t.Union([t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.Union([t.String(), t.Null()])),
              logo: t.Optional(t.Union([t.String(), t.Null()])),
              logo_url: t.Optional(t.Union([t.String(), t.Null()])),
              website: t.Optional(t.Union([t.String(), t.Null()])),
              trustScore: t.Optional(t.Number()),
              totalRatings: t.Optional(t.Number()),
              totalLikes: t.Optional(t.Number()),
              totalDislikes: t.Optional(t.Number()),
              created_at: t.Any(),
              updated_at: t.Any()
            }), t.Null()])
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
        });

        return formatResponse(updatedJob, "Job updated successfully");
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to update job: ${getErrorMessage(error)}`, 500);
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
        status: t.Optional(t.Union([t.Literal('active'), t.Literal('closed'), t.Literal('draft')]))
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
            company_id: t.Union([t.String(), t.Null()]),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
            salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
            seniority: t.Optional(t.Union([t.String(), t.Null()])),
            skills: t.Array(t.String()),
            technical_skills: t.Optional(t.Array(t.String())), employment_type: t.Optional(t.Union([t.String(), t.Null()])), experience_level: t.Optional(t.Union([t.String(), t.Null()])), remote: t.Boolean(), is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])), published_at: t.Any(), expires_at: t.Any(), link: t.Optional(t.Union([t.String(), t.Null()])), source: t.Optional(t.Union([t.String(), t.Null()])), language: t.Optional(t.Union([t.String(), t.Null()])),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.Any(),
            updated_at: t.Any(),
            company: t.Union([t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.Union([t.String(), t.Null()])),
              logo: t.Optional(t.Union([t.String(), t.Null()])),
              website: t.Optional(t.Union([t.String(), t.Null()])),
              trustScore: t.Optional(t.Number()),
              totalRatings: t.Optional(t.Number()),
              totalLikes: t.Optional(t.Number()),
              totalDislikes: t.Optional(t.Number()),
              created_at: t.Any(),
              updated_at: t.Any()
            }), t.Null()])
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
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to delete job: ${getErrorMessage(error)}`, 500);
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
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to import job: ${getErrorMessage(error)}`, 500);
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
            company_id: t.Union([t.String(), t.Null()]),
            location: t.Optional(t.String()),
            salary_min: t.Optional(t.Union([t.Number(), t.Null()])),
            salary_max: t.Optional(t.Union([t.Number(), t.Null()])),
            seniority: t.Optional(t.Union([t.String(), t.Null()])),
            skills: t.Array(t.String()),
            technical_skills: t.Optional(t.Array(t.String())), employment_type: t.Optional(t.Union([t.String(), t.Null()])), experience_level: t.Optional(t.Union([t.String(), t.Null()])), remote: t.Boolean(), is_remote: t.Optional(t.Union([t.Boolean(), t.Null()])), published_at: t.Any(), expires_at: t.Any(), link: t.Optional(t.Union([t.String(), t.Null()])), source: t.Optional(t.Union([t.String(), t.Null()])), language: t.Optional(t.Union([t.String(), t.Null()])),
            status: t.Union([t.String(), t.Null(), t.Undefined()]),
            created_at: t.Any(),
            updated_at: t.Any(),
            company: t.Union([t.Object({
              id: t.String(),
              name: t.String(),
              description: t.Optional(t.Union([t.String(), t.Null()])),
              logo: t.Optional(t.Union([t.String(), t.Null()])),
              website: t.Optional(t.Union([t.String(), t.Null()])),
              trustScore: t.Optional(t.Number()),
              totalRatings: t.Optional(t.Number()),
              totalLikes: t.Optional(t.Number()),
              totalDislikes: t.Optional(t.Number()),
              created_at: t.Any(),
              updated_at: t.Any()
            }), t.Null()])
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
      } catch (error: unknown) {
        set.status = 500;
        return formatError(`Failed to import jobs: ${getErrorMessage(error)}`, 500);
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