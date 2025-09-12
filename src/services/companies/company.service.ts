import { prisma } from "../../config/database";

export interface CompanyCreateInput {
  name: string;
  description: string;
  website?: string;
  logo?: string;
}

export interface CompanyUpdateInput {
  name?: string;
  description?: string;
  website?: string;
  logo?: string;
  trustScore?: number;
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

/**
 * Get all companies with pagination
 * @param page - Page number
 * @param limit - Number of items per page
 * @returns Companies with pagination info
 */
export const getCompanies = async (page: number = 1, limit: number = 10) => {
  const skip = (page - 1) * limit;
  
  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      skip,
      take: limit,
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.company.count()
  ]);
  
  return {
    companies,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get company by ID
 * @param id - Company ID
 * @returns Company details
 */
export const getCompanyById = async (id: string) => {
  return await prisma.company.findUnique({
    where: { id }
  });
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