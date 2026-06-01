import { prisma } from "../../config/database";
import type { Prisma } from "@prisma/client";

export interface CompanyCreateInput {
  name: string;
  description?: string | null;
  website?: string;
  logo?: string;
}

export interface CompanyUpdateInput {
  name?: string;
  description?: string;
  website?: string;
  logo?: string;
}

/**
 * Create a new company
 * @param data - Company data
 * @returns Created company
 */
export const createCompany = async (data: CompanyCreateInput) => {
  return await prisma.company.create({
    data
  });
};

export type CompanySortBy = "name" | "trustScore" | "jobsCount" | "created_at";

export interface CompanyListFilters {
  q?: string;
  /** Inclusive lower bound on trustScore (0–100). */
  trustMin?: number;
  /** Inclusive upper bound on trustScore (0–100). */
  trustMax?: number;
  /** Inclusive lower bound on created_at (ISO string or Date). */
  dateFrom?: string | Date;
  /** Inclusive upper bound on created_at (ISO string or Date). */
  dateTo?: string | Date;
  sortBy?: CompanySortBy;
  sortOrder?: "asc" | "desc";
}

/**
 * Build the Prisma `orderBy` for the companies list. `jobsCount` is a relation
 * aggregate, so it uses the `{ jobs: { _count } }` form; every other key maps to
 * a scalar column. Defaults to newest-first.
 */
const buildCompanyOrderBy = (
  sortBy: CompanySortBy = "created_at",
  sortOrder: "asc" | "desc" = "desc"
): Prisma.CompanyOrderByWithRelationInput => {
  if (sortBy === "jobsCount") {
    return { jobs: { _count: sortOrder } };
  }
  return { [sortBy]: sortOrder } as Prisma.CompanyOrderByWithRelationInput;
};

/**
 * Get all companies with pagination, server-side filtering and sorting.
 * @param page - Page number (1-based)
 * @param limit - Number of items per page
 * @param filters - Optional search/trust/date filters + sort
 * @returns Companies with pagination info
 */
export const getCompanies = async (
  page = 1,
  limit = 10,
  filters?: CompanyListFilters
) => {
  const skip = (page - 1) * limit;
  const where: Prisma.CompanyWhereInput = {};

  if (filters?.q) {
    where.name = { contains: filters.q, mode: "insensitive" };
  }

  // Trust score range (model stores a non-null Float, default 80).
  if (filters?.trustMin !== undefined || filters?.trustMax !== undefined) {
    where.trustScore = {};
    if (filters.trustMin !== undefined) where.trustScore.gte = filters.trustMin;
    if (filters.trustMax !== undefined) where.trustScore.lte = filters.trustMax;
  }

  // Creation date range.
  if (filters?.dateFrom || filters?.dateTo) {
    where.created_at = {};
    if (filters.dateFrom) where.created_at.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.created_at.lte = new Date(filters.dateTo);
  }

  const orderBy = buildCompanyOrderBy(filters?.sortBy, filters?.sortOrder);

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      // Number of jobs linked to each company, surfaced as `jobsCount`.
      include: { _count: { select: { jobs: true } } },
    }),
    prisma.company.count({ where }),
  ]);

  return {
    companies: companies.map(({ _count, ...company }) => ({
      ...company,
      jobsCount: _count.jobs,
    })),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get company by ID
 * @param id - Company ID
 * @returns Company details
 */
export const getCompanyById = async (id: string) => {
  const company = await prisma.company.findUnique({
    where: { id },
    include: { _count: { select: { jobs: true } } },
  });
  if (!company) return null;
  const { _count, ...rest } = company;
  return { ...rest, jobsCount: _count.jobs };
};

/**
 * Update company
 * @param id - Company ID
 * @param data - Update data
 * @returns Updated company
 */
export const updateCompany = async (id: string, data: CompanyUpdateInput) => {
  return await prisma.company.update({
    where: { id },
    data
  });
};

/**
 * Delete company
 * @param id - Company ID
 * @returns Deletion result
 */
export const deleteCompany = async (id: string) => {
  return await prisma.company.delete({
    where: { id }
  });
};