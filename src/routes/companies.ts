import { Elysia, t } from "elysia";
import {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany
} from "../services/companies/company.service";
import { formatResponse, formatError } from "../utils/response";

export const companyRoutes = new Elysia({ prefix: "/companies" })
  /**
   * Create a new company
   * @method POST
   * @path /companies
   */
  .post(
    "/",
    async ({ user, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }
        
        // Only admins can create companies
        if (user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only admins can create companies", 403);
        }
        
        const company = await createCompany(body);
        
        set.status = 201;
        return formatResponse(company, "Company created successfully", 201);
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to create company", 500);
      }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        description: t.String({ minLength: 1 }),
        website: t.Optional(t.String({ format: "uri" })),
        logo: t.Optional(t.String({ format: "uri" }))
      }),
      response: {
        201: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            name: t.String(),
            description: t.String(),
            logo: t.Optional(t.String()),
            website: t.Optional(t.String()),
            trustScore: t.Number(),
            createdAt: t.String(),
            updatedAt: t.String()
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
        tags: ["companies"]
      }
    }
  )
  /**
   * Get all companies with pagination
   * @method GET
   * @path /companies
   */
  .get(
    "/",
    async ({ query, set }) => {
      try {
        const page = parseInt(query.page || "1");
        const limit = parseInt(query.limit || "10");
        
        const result = await getCompanies(page, limit);
        
        return formatResponse(result, "Companies retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve companies", 500);
      }
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            companies: t.Array(t.Object({
              id: t.String(),
              name: t.String(),
              description: t.String(),
              logo: t.Optional(t.String()),
              website: t.Optional(t.String()),
              trustScore: t.Number(),
              createdAt: t.String(),
              updatedAt: t.String()
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
        tags: ["companies"]
      }
    }
  )
  /**
   * Get company by ID
   * @method GET
   * @path /companies/:id
   */
  .get(
    "/:id",
    async ({ params, set }) => {
      try {
        const company = await getCompanyById(params.id);
        
        if (!company) {
          set.status = 404;
          return formatError("Company not found", 404);
        }
        
        return formatResponse(company, "Company retrieved successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to retrieve company", 500);
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
            name: t.String(),
            description: t.String(),
            logo: t.Optional(t.String()),
            website: t.Optional(t.String()),
            trustScore: t.Number(),
            createdAt: t.String(),
            updatedAt: t.String()
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
        tags: ["companies"]
      }
    }
  )
  /**
   * Update company
   * @method PUT
   * @path /companies/:id
   */
  .put(
    "/:id",
    async ({ user, params, body, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }
        
        // Only admins can update companies
        if (user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only admins can update companies", 403);
        }
        
        // Check if company exists
        const company = await getCompanyById(params.id);
        if (!company) {
          set.status = 404;
          return formatError("Company not found", 404);
        }
        
        const updatedCompany = await updateCompany(params.id, body);
        
        return formatResponse(updatedCompany, "Company updated successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to update company", 500);
      }
    },
    {
      params: t.Object({
        id: t.String()
      }),
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1 })),
        description: t.Optional(t.String({ minLength: 1 })),
        website: t.Optional(t.String({ format: "uri" })),
        logo: t.Optional(t.String({ format: "uri" })),
        trustScore: t.Optional(t.Number())
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          status: t.Number(),
          message: t.String(),
          data: t.Object({
            id: t.String(),
            name: t.String(),
            description: t.String(),
            logo: t.Optional(t.String()),
            website: t.Optional(t.String()),
            trustScore: t.Number(),
            createdAt: t.String(),
            updatedAt: t.String()
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
        tags: ["companies"]
      }
    }
  )
  /**
   * Delete company
   * @method DELETE
   * @path /companies/:id
   */
  .delete(
    "/:id",
    async ({ user, params, set }) => {
      try {
        if (!user) {
          set.status = 401;
          return formatError("Unauthorized", 401);
        }
        
        // Only admins can delete companies
        if (user.role !== "ADMIN") {
          set.status = 403;
          return formatError("Forbidden: Only admins can delete companies", 403);
        }
        
        // Check if company exists
        const company = await getCompanyById(params.id);
        if (!company) {
          set.status = 404;
          return formatError("Company not found", 404);
        }
        
        await deleteCompany(params.id);
        
        return formatResponse(null, "Company deleted successfully");
      } catch (error: any) {
        set.status = 500;
        return formatError("Failed to delete company", 500);
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
        tags: ["companies"]
      }
    }
  );